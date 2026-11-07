# 上游来源与本项目边界

本仓库的 `src/`、`tests/` 是在 AI 辅助下实现的角色、记忆、成长、待办及宿主兼容扩展，使用根目录 MIT 许可。

`vendor/maodie-pet/` 来自 [Edwardpch/maodie-pet](https://github.com/Edwardpch/maodie-pet)，固定源提交 `7d02caa93a098eec6579d43ee5a736f429748c61`，保留原作者 MIT 许可、README、素材与工具。本地版本记为 `0.3.10-repro.1`：修复配置重复覆盖、换行测试假设、菜单 null 事件误触发；具体见该目录 `REPRODUCTION-PATCH.md`。这是带本地修订的上游副本，不是本项目原创猫动画，也不是上游发布版本。

桌面运行时依赖 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 0.4.5，宿主为 DeepSeek Harness；两者未打包进本仓库。模型账号需使用者自行在宿主登录。本仓库不附账号、密钥、用户成长存档、聊天记忆或本机桌面截图。
