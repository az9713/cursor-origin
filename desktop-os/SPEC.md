# Desktop OS — frozen spec

Internal spec for Project 3. Vanilla HTML/CSS/JS. No new dependencies. Persist to `localStorage` key `desktop-os-v1`.

## Product

A demoable in-browser desktop at `desktop-os/index.html`. Warm paper aesthetic, rust accent `#b4451a`, dark taskbar.

## Shell

- Full-viewport desktop with wallpaper texture
- Dark taskbar: app launchers, running-window indicators, live clock
- Link to hub (`../`)
- Window layer above desktop

## Window manager

- Drag via titlebar
- Click-to-focus with z-index stacking
- Minimize (taskbar restore) and close
- Optional resize handle (bottom-right corner)
- Persist open windows: position, size, minimized state, app id

## Apps

### Notes

- Single text editor pane
- Auto-save body to storage on input

### Finder

- Virtual folder tree backed by shared in-memory VFS
- List files; open file shows read-only content in Finder pane

### Terminal

- Fake shell over the same VFS
- Commands: `ls [path]`, `cat <file>`, `help`, `clear`
- Command history with Up/Down

## VFS (seed)

```
/
  readme.txt
  home/
    welcome.txt
    projects/
      roadmap.txt
  bin/
    hello.sh
```

## Out of scope

Real filesystem, networking, multi-user, installable apps, npm build.
