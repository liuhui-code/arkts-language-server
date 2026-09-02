#!/bin/sh

set -eu

if [ "$#" -gt 1 ]; then
  echo "usage: scripts/install-local.sh [BIN_DIRECTORY]" >&2
  exit 2
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
source_command=$project_root/bin/arkts-language-server
install_dir=${1:-"${HOME}/.local/bin"}
installed_command=$install_dir/arkts-language-server

mkdir -p "$install_dir"

if [ -e "$installed_command" ] || [ -L "$installed_command" ]; then
  if [ -L "$installed_command" ] && [ "$(readlink "$installed_command")" = "$source_command" ]; then
    echo "arkts-language-server is already installed at $installed_command"
    exit 0
  fi
  echo "Refusing to replace existing path: $installed_command" >&2
  exit 1
fi

ln -s "$source_command" "$installed_command"
echo "Installed arkts-language-server at $installed_command"
echo "Ensure $install_dir is on PATH before starting Zed."
