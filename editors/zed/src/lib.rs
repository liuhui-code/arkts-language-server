use zed::{LanguageServerId, Worktree};
use zed_extension_api as zed;

const NODE_PATH: &str = "/usr/local/bin/node";
const SERVER_PATH: &str = "/Users/liuhui/Documents/code/arkts-language-server/dist/server.cjs";

struct ArkTsExtension;

impl zed::Extension for ArkTsExtension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        _language_server_id: &LanguageServerId,
        _worktree: &Worktree,
    ) -> Result<zed::Command, String> {
        Ok(zed::Command {
            command: NODE_PATH.to_string(),
            args: vec![SERVER_PATH.to_string(), "--stdio".to_string()],
            env: Vec::new(),
        })
    }
}

zed::register_extension!(ArkTsExtension);
