package markdown

import (
	"testing"
)

func TestStartupStepsDoNotCreateEmptyNodes(t *testing.T) {
	source := "# xxl-job\n## 源码\n### xxl-job-admin\n- 子主题\n### xxl-job-core\n- 调度中心，XXL-JOB 的核心服务端\n### executor-samples\n- 执行器 SDK，你自己的 Spring Boot 项目会依赖它\n## 使用\n### 启动步骤\n- 1. 配置数据库\n- 2. 访问网页\n  - 默认为 127.0.0.1:8080\n- 3. 配置 access token\n  - 在xxl-job的启动配置文件中\n    - xxl.job.accessToken\n      - 默认\n        - default_token\n"
	doc, err := Parse([]byte(source), "xxl-job.mind.md")
	if err != nil {
		t.Fatal(err)
	}
	steps := moveNodeByLabel(t, doc, "启动步骤")
	if len(steps.Children) != 3 {
		t.Fatalf("startup steps = %d, want 3", len(steps.Children))
	}
	for i, want := range []string{"1. 配置数据库", "2. 访问网页", "3. 配置 access token"} {
		if got := steps.Children[i].Label; got != want {
			t.Errorf("startup step %d = %q, want %q", i+1, got, want)
		}
	}
	if len(doc.Nodes) != 19 || string(doc.Source) != source || steps.Children[2].Children[0].Children[0].Children[0].Children[0].Label != "default_token" {
		t.Fatal("the original document lost nodes, nesting or source bytes")
	}
}

func TestInlineNumberedListDoesNotCreateEmptyNode(t *testing.T) {
	doc, err := Parse([]byte("# Root\n## 使用\n### 启动步骤\n- 1. 配置数据库\n"), "test.mind.md")
	if err != nil {
		t.Fatal(err)
	}
	if got := doc.Root.Children[0].Children[0].Children[0].Children[0].Label; got != "1. 配置数据库" {
		t.Fatalf("node label = %q, want startup step text", got)
	}
}
