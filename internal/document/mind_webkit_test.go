package document

import (
	"encoding/json"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"openmind/internal/workspace"
)

func TestMindWebKitBridge(t *testing.T) {
	addressFile := os.Getenv("OPENMIND_MIND_TEST_ADDRESS")
	if addressFile == "" {
		t.Skip("run with node scripts/test-mind-rules.mjs")
	}
	root := t.TempDir()
	for name, source := range map[string]string{
		"规则.mind.md": "# xxl-job\n## 使用\n### 启动步骤\n- 1. 配置数据库\n- 2. 访问网页\n  - 默认为 127.0.0.1:8080\n- 3. 配置 access token\n  - 在xxl-job的启动配置文件中\n    - xxl.job.accessToken\n      - 默认\n        - default_token\n#### 不显示四级标题\n- 不显示四级列表\n# 第二主节点\n## 第二分支\n### 第二主题\n- 独立细分\n## 不允许跳级\n- 不显示跳级列表\n",
		"正文.md":      "# 正文\n\n#### 四级标题\n\n1. 有序列表\n2. 第二项\n",
		"空白.mind.md": "",
		"颜色.mind.md": "# 主节点 [color:#DC6A5E]\n## 二级 [color:#3B82F6]\n### 三级 [color:#5EAA80]\n- 子项 [color:#D5AA45]\n  - 深层 [color:#858C98]\n```md\n# 示例 [color:#123456]\n```\n",
	} {
		if err := os.WriteFile(filepath.Join(root, name), []byte(source), 0644); err != nil {
			t.Fatal(err)
		}
	}
	w, err := workspace.Open(root)
	if err != nil {
		t.Fatal(err)
	}
	s := New(t.TempDir())
	s.SetWorkspace(w)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	finished := make(chan struct{})
	var finish sync.Once
	server := &http.Server{Handler: http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		var input struct {
			Method string            `json:"method"`
			Args   []json.RawMessage `json:"args"`
		}
		err := json.NewDecoder(request.Body).Decode(&input)
		var value any
		arg := func(index int, target any) {
			if err == nil && index < len(input.Args) {
				err = json.Unmarshal(input.Args[index], target)
			}
		}
		if err == nil {
			switch input.Method {
			case "OpenDocument":
				var name string
				arg(0, &name)
				if err == nil {
					value, err = s.Open(name)
				}
			case "ApplyEdit":
				var edit Edit
				arg(0, &edit)
				if err == nil {
					value, err = s.Apply(edit)
				}
			case "ReparseDocument":
				var session string
				arg(0, &session)
				if err == nil {
					value, err = s.Reparse(session)
				}
			case "CopyNodeMarkdown", "CopyNodeText":
				var session, nodeID string
				var label *string
				arg(0, &session)
				arg(1, &nodeID)
				arg(2, &label)
				if err == nil {
					if input.Method == "CopyNodeText" {
						value, err = s.NodeText(session, nodeID, label)
					} else {
						value, err = s.NodeMarkdown(session, nodeID, label)
					}
				}
			case "ReadDisk":
				name := "规则.mind.md"
				arg(0, &name)
				var data []byte
				if err == nil {
					data, err = os.ReadFile(filepath.Join(root, name))
				}
				value = string(data)
			case "Finish":
				finish.Do(func() { close(finished) })
			default:
				response.WriteHeader(http.StatusNotFound)
				return
			}
		}
		response.Header().Set("Content-Type", "application/json")
		if err != nil {
			response.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(response).Encode(map[string]string{"error": err.Error()})
		} else {
			_ = json.NewEncoder(response).Encode(map[string]any{"value": value})
		}
	})}
	go func() { _ = server.Serve(listener) }()
	t.Cleanup(func() { _ = server.Close() })
	if err := os.WriteFile(addressFile, []byte("http://"+listener.Addr().String()), 0600); err != nil {
		t.Fatal(err)
	}
	select {
	case <-finished:
	case <-time.After(90 * time.Second):
		t.Fatal("native mind regression timed out")
	}
}
