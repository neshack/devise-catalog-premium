#!/bin/sh
# Refresh the desktop caches so the installed icon and entry appear at once
# instead of waiting for the next login. Every command is best-effort: a
# minimal system without the cache tools must still finish the install.
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t /usr/share/icons/hicolor >/dev/null 2>&1 || true
fi
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
fi
exit 0
