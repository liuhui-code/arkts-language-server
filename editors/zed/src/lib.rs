use zed::{LanguageServerId, Worktree};
use zed_extension_api as zed;

struct ArkTsExtension;

impl zed::Extension for ArkTsExtension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<zed::Command, String> {
        let binary_settings =
            zed::settings::LspSettings::for_worktree(language_server_id.as_ref(), worktree)?.binary;
        let arguments = binary_settings
            .as_ref()
            .and_then(|binary| binary.arguments.clone())
            .unwrap_or_else(|| vec!["--stdio".to_string()]);
        let environment = binary_settings
            .as_ref()
            .and_then(|binary| binary.env.clone())
            .map(|env| env.into_iter().collect())
            .unwrap_or_else(|| worktree.shell_env());

        if let Some(command) = binary_settings.and_then(|binary| binary.path) {
            return Ok(zed::Command {
                command,
                args: arguments,
                env: environment,
            });
        }

        let managed_command = std::env::current_dir()
            .ok()
            .map(|directory| directory.join("bin").join("arkts-language-server"))
            .filter(|command| command.is_file())
            .map(|command| command.to_string_lossy().into_owned());
        let command = managed_command
            .or_else(|| worktree.which("arkts-language-server"))
            .ok_or_else(|| {
                "ArkTS language server was not found. Run `pnpm zed:install`, configure `lsp.arkts-language-server.binary.path`, or add arkts-language-server to PATH."
                    .to_string()
            })?;

        Ok(zed::Command {
            command,
            args: arguments,
            env: environment,
        })
    }
}

zed::register_extension!(ArkTsExtension);
