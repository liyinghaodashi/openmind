package document

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"openmind/internal/filestore"
	"openmind/internal/markdown"
)

func (s *Service) relocateMarkdown(full, target, oldPath, newPath string) ([]byte, error) {
	source, _, err := filestore.Read(full, markdown.MaxBytes)
	if err != nil {
		return nil, err
	}
	oldFolder := ".assets/" + strings.TrimSuffix(filepath.Base(oldPath), filepath.Ext(oldPath))
	newFolder := ".assets/" + strings.TrimSuffix(filepath.Base(newPath), filepath.Ext(newPath))
	next := markdown.RenameAssetReferences(source, oldFolder, newFolder)
	if _, err = markdown.Parse(next, newPath); err != nil {
		return nil, err
	}
	oldAssets, err := s.workspace.Resolve(imageFolder(oldPath), false)
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	hasAssets := err == nil
	if hasAssets {
		info, statErr := os.Lstat(oldAssets)
		if statErr != nil {
			return nil, statErr
		}
		if !info.IsDir() {
			return nil, fmt.Errorf("图片资源路径不是文件夹")
		}
	}
	newAssets := oldAssets
	if hasAssets && imageFolder(oldPath) != imageFolder(newPath) {
		parent := filepath.Dir(imageFolder(newPath))
		parentFull, err := s.workspace.Resolve(parent, true)
		if err != nil {
			return nil, err
		}
		if err = os.Mkdir(parentFull, 0755); err != nil && !os.IsExist(err) {
			return nil, err
		}
		newAssets, err = s.workspace.Resolve(imageFolder(newPath), true)
		if err != nil {
			return nil, err
		}
		if err = renameFile(oldAssets, newAssets); err != nil {
			return nil, fmt.Errorf("移动图片目录失败（请检查是否已有同名目录）：%w", err)
		}
	}
	rollbackAssets := func() error {
		if hasAssets && oldAssets != newAssets {
			return renameFile(newAssets, oldAssets)
		}
		return nil
	}
	if err = renameFile(full, target); err != nil {
		return nil, errors.Join(err, rollbackAssets())
	}
	if !bytes.Equal(source, next) {
		result, replaceErr := filestore.Replace(target, source, next, s.recovery, markdown.MaxBytes)
		if replaceErr != nil {
			if result.Replaced {
				_, revertErr := filestore.Replace(target, next, source, s.recovery, markdown.MaxBytes)
				if revertErr != nil {
					return nil, errors.Join(replaceErr, fmt.Errorf("回退文档失败：%w", revertErr))
				}
			}
			return nil, errors.Join(replaceErr, renameFile(target, full), rollbackAssets())
		}
	}
	return next, nil
}

func (s *Service) trashMarkdown(full, rel string) error {
	assets, err := s.workspace.Resolve(imageFolder(rel), false)
	if os.IsNotExist(err) {
		return s.trash(full)
	}
	if err != nil {
		return err
	}
	info, err := os.Lstat(assets)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("图片资源路径不是文件夹")
	}
	bundle := filepath.Join(filepath.Dir(full), strings.TrimSuffix(filepath.Base(full), filepath.Ext(full))+"（含图片）-"+randomID()[:8])
	if err = os.Mkdir(bundle, 0700); err != nil {
		return err
	}
	assetParent := filepath.Join(bundle, ".assets")
	if err = os.Mkdir(assetParent, 0700); err != nil {
		os.Remove(bundle)
		return err
	}
	bundledAssets := filepath.Join(assetParent, filepath.Base(assets))
	bundledDocument := filepath.Join(bundle, filepath.Base(full))
	if err = renameFile(assets, bundledAssets); err != nil {
		os.Remove(assetParent)
		os.Remove(bundle)
		return err
	}
	if err = renameFile(full, bundledDocument); err != nil {
		rollbackErr := renameFile(bundledAssets, assets)
		os.Remove(assetParent)
		os.Remove(bundle)
		return errors.Join(err, rollbackErr)
	}
	if err = s.trash(bundle); err != nil {
		docErr, assetErr := renameFile(bundledDocument, full), renameFile(bundledAssets, assets)
		os.Remove(assetParent)
		os.Remove(bundle)
		return errors.Join(err, docErr, assetErr)
	}
	return nil
}
