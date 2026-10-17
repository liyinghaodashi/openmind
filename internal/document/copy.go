package document

import "fmt"

func (s *Service) NodeText(session, nodeID string, label *string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.doc == nil || session != s.session {
		return "", fmt.Errorf("文档会话已变化，请重新选择节点后复制")
	}
	node := s.doc.Nodes[nodeID]
	if node == nil {
		return "", fmt.Errorf("节点已变化，请重新选择后复制")
	}
	if label != nil && node.Editable {
		return *label, nil
	}
	return node.Label, nil
}

func (s *Service) NodeMarkdown(session, nodeID string, label *string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.doc == nil || session != s.session {
		return "", fmt.Errorf("文档会话已变化，请重新选择节点后复制")
	}
	return s.doc.BranchMarkdown(nodeID, label)
}
