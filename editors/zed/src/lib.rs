use zed::{LanguageServerId, Worktree};
use zed_extension_api as zed;

struct ArkTsExtension;

impl zed::Extension for ArkTsExtension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        _language_server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<zed::Command, String> {
        let command = worktree.which("arkts-language-server").ok_or_else(|| {
            "ArkTS language server was not found. Install arkts-language-server and ensure it is available on PATH."
                .to_string()
        })?;

        Ok(zed::Command {
            command,
            args: vec!["--stdio".to_string()],
            env: Vec::new(),
        })
    }
}

zed::register_extension!(ArkTsExtension);
