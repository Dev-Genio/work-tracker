# Icons

Tauri requires the icon files listed in `tauri.conf.json`. Generate them once from a source PNG (1024×1024):

```sh
pnpm --filter @work-tracker/desktop tauri icon path/to/source.png
```

That writes `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, and `icon.ico` into this directory.
