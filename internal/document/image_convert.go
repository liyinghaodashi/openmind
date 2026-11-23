package document

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"strings"

	"github.com/gen2brain/avif"
)

func (s *Service) ConvertImageAVIF(session, encoded string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.doc == nil || session != s.session || s.blocked || strings.HasSuffix(strings.ToLower(s.path), ".mind.md") {
		return "", fmt.Errorf("当前文档不能导入图片")
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(data) == 0 {
		return "", fmt.Errorf("图片内容无效")
	}
	input, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return "", fmt.Errorf("无法读取图片：%w", err)
	}
	var output bytes.Buffer
	if err = avif.Encode(&output, input, avif.Options{Quality: 82, QualityAlpha: 82, Speed: 8}); err != nil {
		return "", fmt.Errorf("无法编码 AVIF：%w", err)
	}
	return "data:image/avif;base64," + base64.StdEncoding.EncodeToString(output.Bytes()), nil
}
