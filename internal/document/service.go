package document

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"openmind/internal/filestore"
	"openmind/internal/markdown"
	"openmind/internal/workspace"
)

type Snapshot struct {
	Session       string            `json:"session"`
	Version       int               `json:"version"`
	Path          string            `json:"path"`
	Source        string            `json:"source"`
	Root          *markdown.Node    `json:"root"`
	Hash          string            `json:"hash"`
	CreatedNodeID string            `json:"createdNodeId,omitempty"`
	FocusNodeID   string            `json:"focusNodeId,omitempty"`
	NodeIDMap     map[string]string `json:"nodeIdMap,omitempty"`
	ImageWarning  string            `json:"imageWarning,omitempty"`
}

type Edit struct {
	Session   string `json:"session"`
	Version   int    `json:"version"`
	OpID      string `json:"opId"`
	Kind      string `json:"kind"`
	NodeID    string `json:"nodeId"`
	Text      string `json:"text"`
	TargetID  string `json:"targetId"`
	Placement string `json:"placement"`
}

type Service struct {
	mu              sync.Mutex
	workspace       *workspace.Workspace
	recovery        string
	session         string
	path            string
	version         int
	doc             *markdown.Document
	blocked         bool
	lastOp          string
	lastFingerprint string
	lastReply       *Snapshot
	commits         int
	archived        map[string]archivedDocument
	trash           func(string) error
}

type archivedDocument struct {
	path string
	doc  *markdown.Document
}

func New(recovery string) *Service {
	return &Service{recovery: recovery, archived: map[string]archivedDocument{}, trash: trashFile}
}

func (s *Service) archive() {
	if s.doc == nil {
		return
	}
	if len(s.archived) >= 8 {
		s.archived = map[string]archivedDocument{}
	}
	s.archived[s.session] = archivedDocument{s.path, s.doc}
}

func (s *Service) SetWorkspace(w *workspace.Workspace) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.workspace = w
	s.doc = nil
	s.session = ""
	s.path = ""
	s.blocked = false
	s.lastReply = nil
}
func (s *Service) List(path string) ([]workspace.Entry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.workspace == nil {
		return nil, fmt.Errorf("请先选择文件夹")
	}
	return s.workspace.List(path)
}

func (s *Service) Open(path string) (*Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.open(s.workspace, path, nil)
}

func (s *Service) OpenWorkspace(w *workspace.Workspace, path string, commit func() error) (*Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.open(w, path, commit)
}

func (s *Service) open(w *workspace.Workspace, path string, commit func() error) (*Snapshot, error) {
	if w == nil {
		return nil, fmt.Errorf("请先选择文件夹")
	}
	if !workspace.IsMarkdown(path) {
		return nil, fmt.Errorf("请选择 Markdown 文件")
	}
	full, err := w.Resolve(path, false)
	if err != nil {
		return nil, err
	}
	data, _, err := filestore.Read(full, markdown.MaxBytes)
	if err != nil {
		return nil, err
	}
	doc, err := markdown.Parse(data, path)
	if err != nil {
		return nil, err
	}
	if commit != nil {
		if err := commit(); err != nil {
			return nil, err
		}
	}
	if s.workspace == w {
		s.archive()
	} else {
		s.archived = map[string]archivedDocument{}
	}
	s.workspace = w
	s.session = randomID()
	s.path = path
	s.version = 1
	s.doc = doc
	s.blocked = false
	s.lastReply = nil
	s.lastOp = ""
	return s.snapshot(), nil
}

func (s *Service) snapshot() *Snapshot {
	return &Snapshot{Session: s.session, Version: s.version, Path: s.path, Source: string(s.doc.Source), Root: s.doc.Root, Hash: filestore.Hash(s.doc.Source)}
}

func (s *Service) Apply(edit Edit) (*Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.doc == nil || edit.Session != s.session {
		return nil, fmt.Errorf("文档会话已变化，请重新打开")
	}
	fingerprint := filestore.Hash([]byte(fmt.Sprintf("%s\x00%d\x00%s\x00%s\x00%s\x00%s\x00%s", edit.Session, edit.Version, edit.Kind, edit.NodeID, edit.Text, edit.TargetID, edit.Placement)))
	if edit.OpID != "" && edit.OpID == s.lastOp {
		if fingerprint != s.lastFingerprint {
			return nil, fmt.Errorf("操作编号重复但内容不同")
		}
		return s.lastReply, nil
	}
	if s.blocked {
		return nil, fmt.Errorf("写入已暂停，请先处理文件冲突或错误")
	}
	if edit.Version != s.version {
		return nil, fmt.Errorf("文档版本已变化，未覆盖磁盘内容")
	}
	if edit.OpID == "" {
		return nil, fmt.Errorf("缺少操作编号")
	}
	var next *markdown.Document
	var err error
	var createdNodeID string
	var focusNodeID string
	var nodeIDMap map[string]string
	switch edit.Kind {
	case "label":
		next, err = s.doc.WithLabel(edit.NodeID, edit.Text)
	case "node-color":
		next, err = s.doc.WithColor(edit.NodeID, edit.Text)
	case "source":
		next, err = markdown.Parse(markdown.PreserveLineEndings(s.doc.Source, edit.Text), s.path)
	case "restore-mind":
		if !strings.HasSuffix(strings.ToLower(s.path), ".mind.md") {
			return nil, fmt.Errorf("仅思维导图文档支持恢复节点操作")
		}
		next, err = markdown.Parse([]byte(edit.Text), s.path)
	case "insert-sibling":
		next, createdNodeID, err = s.doc.WithSibling(edit.NodeID)
	case "insert-child":
		next, createdNodeID, err = s.doc.WithChild(edit.NodeID)
	case "delete-node":
		next, nodeIDMap, focusNodeID, err = s.doc.WithoutNode(edit.NodeID)
	case "move-node":
		if !strings.HasSuffix(strings.ToLower(s.path), ".mind.md") {
			return nil, fmt.Errorf("仅思维导图文档支持拖动节点")
		}
		next, nodeIDMap, focusNodeID, err = s.doc.WithMovedNode(edit.NodeID, edit.TargetID, edit.Placement)
	default:
		return nil, fmt.Errorf("不支持的编辑操作")
	}
	if err != nil {
		return nil, err
	}
	if bytes.Equal(next.Source, s.doc.Source) {
		reply := s.snapshot()
		reply.FocusNodeID = focusNodeID
		reply.NodeIDMap = nodeIDMap
		s.lastOp = edit.OpID
		s.lastFingerprint = fingerprint
		s.lastReply = reply
		return reply, nil
	}
	full, err := s.workspace.Resolve(s.path, false)
	if err != nil {
		s.blocked = true
		return nil, err
	}
	if err = s.restoreImages(next.Source); err != nil {
		return nil, fmt.Errorf("恢复图片失败，未保存文档：%w", err)
	}
	previous := s.doc.Source
	result, err := filestore.Replace(full, s.doc.Source, next.Source, s.recovery, markdown.MaxBytes)
	if err != nil {
		s.blocked = true
		if result.Replaced {
			s.doc = next
			s.version++
		}
		return nil, err
	}
	s.doc = next
	s.version++
	s.commits++
	reply := s.snapshot()
	if err = s.cleanupImages(previous, next.Source); err != nil {
		reply.ImageWarning = fmt.Sprintf("文档已保存，但图片清理失败：%v", err)
	}
	reply.CreatedNodeID = createdNodeID
	reply.FocusNodeID = focusNodeID
	reply.NodeIDMap = nodeIDMap
	s.lastOp = edit.OpID
	s.lastFingerprint = fingerprint
	s.lastReply = reply
	return reply, nil
}

func (s *Service) Check() (*Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.doc == nil || s.blocked {
		return nil, nil
	}
	full, err := s.workspace.Resolve(s.path, false)
	if err != nil {
		return nil, err
	}
	data, _, err := filestore.Read(full, markdown.MaxBytes)
	if err != nil {
		return nil, err
	}
	if bytes.Equal(data, s.doc.Source) {
		return nil, nil
	}
	second, _, err := filestore.Read(full, markdown.MaxBytes)
	if err != nil {
		return nil, err
	}
	if !bytes.Equal(data, second) {
		return nil, nil
	}
	doc, err := markdown.Parse(second, s.path)
	if err != nil {
		return nil, err
	}
	s.archive()
	s.doc = doc
	s.version++
	s.session = randomID()
	s.lastReply = nil
	s.lastOp = ""
	return s.snapshot(), nil
}

func (s *Service) Reparse(session string) (*Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.doc == nil || session != s.session {
		return nil, fmt.Errorf("文档会话已变化")
	}
	doc, err := markdown.Parse(s.doc.Source, s.path)
	if err != nil {
		return nil, err
	}
	s.archive()
	s.doc = doc
	s.session = randomID()
	s.lastReply = nil
	s.lastOp = ""
	return s.snapshot(), nil
}

func (s *Service) PreserveDraft(session, kind, nodeID, value string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.doc == nil {
		return "", fmt.Errorf("没有可恢复的文档")
	}
	doc, path := s.doc, s.path
	if session != s.session {
		old, ok := s.archived[session]
		if !ok {
			return "", fmt.Errorf("会话已变化，未保存恢复副本")
		}
		doc, path = old.doc, old.path
	}
	if len(value) > markdown.MaxBytes {
		return "", fmt.Errorf("恢复内容超过 2MB")
	}
	data := markdown.PreserveLineEndings(doc.Source, value)
	if kind == "label" || kind == "node-color" {
		var d *markdown.Document
		var err error
		if kind == "node-color" {
			d, err = doc.WithColor(nodeID, value)
		} else {
			d, err = doc.WithLabel(nodeID, value)
		}
		if err != nil {
			return "", err
		}
		data = d.Source
	}
	full := filepath.Join(s.workspace.Root, path)
	return filestore.ConflictCopy(s.recovery, full, data)
}

func (s *Service) Create(parent, name string, directory bool) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.workspace == nil {
		return "", fmt.Errorf("请先选择文件夹")
	}
	if err := workspace.ValidateName(name); err != nil {
		return "", err
	}
	if !directory && !workspace.IsMarkdown(name) {
		name += ".md"
	}
	rel := filepath.Join(parent, name)
	full, err := s.workspace.Resolve(rel, true)
	if err != nil {
		return "", err
	}
	if directory {
		return filepath.ToSlash(rel), os.Mkdir(full, 0755)
	}
	f, err := os.OpenFile(full, os.O_WRONLY|os.O_CREATE|os.O_EXCL|syscallNoFollow(), 0644)
	if err != nil {
		return "", err
	}
	defer f.Close()
	title := strings.TrimSuffix(name, filepath.Ext(name))
	source := "# " + title + "\n\n"
	if strings.HasSuffix(strings.ToLower(name), ".mind.md") {
		title = title[:len(title)-len(".mind")]
		source = "# " + title + "\n\n## 新想法\n\n### 开始\n\n- 从这里开始\n"
	}
	if _, err = f.WriteString(source); err != nil {
		return "", err
	}
	if err = f.Sync(); err != nil {
		return "", err
	}
	return filepath.ToSlash(rel), nil
}

func randomID() string {
	var data [16]byte
	if _, err := rand.Read(data[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(data[:])
}
