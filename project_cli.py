#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# NOTE: Run with venv: source venv/bin/activate && python project_cli.py
#       OR: ./venv/bin/python project_cli.py
import os
import sys
import json
import subprocess
from pathlib import Path
from datetime import datetime

try:
    import rich
    import prompt_toolkit
except ImportError:
    print("Thiếu thư viện! Đang cài đặt...")
    # Try installing with --break-system-packages for macOS/Homebrew Python (PEP 668)
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "rich", "prompt-toolkit",
         "--break-system-packages", "--quiet"],
        capture_output=True
    )
    if result.returncode != 0:
        # Fallback: try without the flag (works in virtualenvs)
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "rich", "prompt-toolkit", "--quiet"],
            check=True
        )
    os.execv(sys.executable, [sys.executable] + sys.argv)

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.prompt import Prompt, IntPrompt, Confirm
from rich.box import ROUNDED, SIMPLE  # noqa: F401
import rich.box as box
from prompt_toolkit import PromptSession
from prompt_toolkit.completion import Completer, Completion
from prompt_toolkit.formatted_text import HTML
from prompt_toolkit.styles import Style

console = Console()
CONFIG_DIR = Path.home() / ".project-cli"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)
APPS_FILE = CONFIG_DIR / "projects.json"
PM2_CONFIG = CONFIG_DIR / "ecosystem.config.js"

COMMANDS = [
    ("/add",    "Thêm / cập nhật dự án (FE, BE, Framework...)"),
    ("/list",   "Danh sách dự án + trạng thái PM2"),
    ("/info",   "Xem chi tiết cấu hình 1 dự án"),
    ("/dev",    "Khởi chạy dự án (1 hoặc tất cả)"),
    ("/stop",   "Dừng dự án (1 hoặc tất cả)"),
    ("/restart","Restart dự án (1 hoặc tất cả)"),
    ("/logs",   "Xem logs stream của dự án"),
    ("/remove", "Xoá dự án khỏi config"),
    ("/help",   "Trợ giúp"),
    ("/exit",   "Thoát CLI"),
]

# ─── Config I/O ──────────────────────────────────────────────

def load_apps():
    if not APPS_FILE.exists():
        return []
    try:
        return json.loads(APPS_FILE.read_text())
    except Exception:
        return []

def save_apps(apps):
    APPS_FILE.write_text(json.dumps(apps, indent=4, ensure_ascii=False))
    _write_pm2_config(apps)

def _write_pm2_config(apps):
    lines = ["module.exports = {", "  apps: ["]
    for a in apps:
        env = a.get("env", {}).copy()
        
        script = a.get('script','npm')
        interpreter = a.get('interpreter', '')
        if not interpreter:
            # If the script is a known binary or doesn't end with .js, execute it directly
            if script not in ["npm", "yarn", "pnpm", "node", "npx"] and not script.endswith(".js"):
                interpreter = "none"
                
        # Always inject PATH for rbenv since it's commonly used on macOS for Rails projects
        current_path = os.environ.get("PATH", "/usr/bin:/bin")
        rbenv_paths = f"{Path.home()}/.rbenv/shims:{Path.home()}/.rbenv/bin"
        if ".rbenv/shims" not in current_path and ".rbenv/shims" not in env.get("PATH", ""):
            env["PATH"] = f"{rbenv_paths}:{env.get('PATH', current_path)}"
        
        instances = a.get("instances", 1)
        exec_mode = a.get("exec_mode", "fork")
        kill_timeout = a.get("kill_timeout", 3000)
        restart_delay = a.get("restart_delay", 0)
        env_str = json.dumps(env)
        max_mem = a.get("max_memory_restart", "")
        
        script = a.get('script','npm')
        interpreter = a.get('interpreter', '')
        if not interpreter:
            # If the script is a known binary or doesn't end with .js, execute it directly
            if script not in ["npm", "yarn", "pnpm", "node", "npx"] and not script.endswith(".js"):
                interpreter = "none"

        lines += [
            "    {",
            f"      name: '{a['name']}',",
            f"      cwd: '{a['cwd']}',",
            f"      script: '{script}',",
            f"      args: '{a.get('args','run dev')}',",
            f"      env: {env_str},",
            f"      autorestart: {str(a.get('autorestart',True)).lower()},",
            f"      watch: {str(a.get('watch',False)).lower()},",
            f"      instances: {instances},",
            f"      exec_mode: '{exec_mode}',",
            f"      kill_timeout: {kill_timeout},",
            f"      restart_delay: {restart_delay},",
        ]
        if interpreter:
            lines.append(f"      interpreter: '{interpreter}',")
        if max_mem:
            lines.append(f"      max_memory_restart: '{max_mem}',")
        lines.append("    },")
    lines += ["  ]", "};", ""]
    PM2_CONFIG.write_text("\n".join(lines))

# ─── PM2 Helpers ─────────────────────────────────────────────

def check_pm2():
    try:
        r = subprocess.run(["pm2", "-v"], capture_output=True, text=True)
        return r.returncode == 0
    except FileNotFoundError:
        console.print(Panel(
            "[red]PM2 không tìm thấy trong PATH![/red]\n"
            "[dim]Cài đặt: [cyan]npm install -g pm2[/cyan][/dim]",
            border_style="red", padding=(0,1)
        ))
        return False

def get_pm2_status():
    try:
        r = subprocess.run(["pm2", "jlist"], capture_output=True, text=True)
        if r.returncode == 0:
            return {p["name"]: p for p in json.loads(r.stdout)}
    except Exception:
        pass
    return {}

# ─── Tab Completion ───────────────────────────────────────────

class CommandCompleter(Completer):
    def get_completions(self, document, complete_event):
        text = document.text_before_cursor
        if text.startswith("/") and " " not in text:
            for cmd, desc in COMMANDS:
                if cmd.startswith(text.lower()):
                    start = len(text)
                    yield Completion(
                        cmd[start:], 0,
                        display=HTML(f"<ansibrightcyan>{cmd}</ansibrightcyan>"),
                        display_meta=HTML(f"<ansigray>{desc}</ansigray>")
                    )
        elif text.split(" ")[0] in ["/dev", "/stop", "/logs", "/info", "/remove", "/restart"]:
            apps = load_apps()
            prefix = text.split(" ", 1)[1] if " " in text else ""
            for app in apps:
                if app["name"].startswith(prefix):
                    yield Completion(
                        app["name"][len(prefix):], 0,
                        display=HTML(f"<ansibrightcyan>{app['name']}</ansibrightcyan>"),
                        display_meta=HTML(f"<ansigray>{app.get('type','')}</ansigray>")
                    )

pt_style = Style.from_dict({
    "prompt": "bold #94a3b8",
    "completion-menu.completion":         "bg:#1e293b #94a3b8",
    "completion-menu.completion.current": "bg:#334155 bold #e2e8f0",
})
pt_session = PromptSession(
    completer=CommandCompleter(),
    style=pt_style,
    complete_while_typing=True
)

# ─── UI Helpers ───────────────────────────────────────────────

def print_header():
    console.clear()
    console.print(Panel(
        "[bold white]⬡  Project CLI Dashboard[/bold white]  "
        "[dim]— Quản lý dự án với PM2[/dim]",
        border_style="bright_white", padding=(0, 2)
    ))

def print_help():
    t = Table(box=box.SIMPLE, padding=(0, 2), show_header=False)
    t.add_column("Lệnh",  style="bold cyan",  no_wrap=True)
    t.add_column("Mô tả", style="dim white")
    for c, d in COMMANDS:
        t.add_row(c, d)
    console.print(t)
    console.print("[dim]  ↹ Tab sau dấu / để auto‑complete tên lệnh và tên dự án.[/dim]\n")

def _pick(title: str, choices: list) -> str:
    console.print(f"\n[bold]{title}[/bold]")
    for i, c in enumerate(choices, 1):
        console.print(f"  [cyan]{i:>2}.[/cyan]  {c}")
    while True:
        try:
            v = IntPrompt.ask("Chọn", choices=[str(i) for i in range(1, len(choices)+1)])
            idx = int(v) - 1
            if 0 <= idx < len(choices):
                return choices[idx]
        except Exception:
            pass
    return choices[0]  # fallback, unreachable


def _pick_app(verb="chọn"):
    apps = load_apps()
    if not apps:
        console.print("[yellow]Chưa có dự án nào — hãy dùng /add để thêm.[/yellow]\n")
        return None
    return _pick(f"Dự án muốn {verb}:", [a["name"] for a in apps])

def _status_text(status):
    m = {"online": "[green]● online[/green]",
         "stopped": "[dim]○ stopped[/dim]",
         "errored": "[red]✗ errored[/red]",
         "launching": "[yellow]◌ launching[/yellow]"}
    return m.get(status, f"[dim]{status}[/dim]")

# ─── Commands ─────────────────────────────────────────────────

def cmd_add():
    console.print("\n[bold]Thêm / cập nhật dự án[/bold]  [dim](Enter để giữ giá trị mặc định)[/dim]\n")

    name = Prompt.ask("Tên dự án", default="my-app")

    types = ["Frontend", "Backend", "Fullstack", "Service", "Khác"]
    proj_type = _pick("Loại dự án", types)

    fw_map = {
        "Frontend": ["Next.js", "React (CRA)", "Vue.js", "NuxtJS", "Vite", "Angular", "Khác"],
        "Backend":  ["Express / Node.js", "NestJS", "Ruby on Rails", "Django", "FastAPI", "Laravel", "Khác"],
        "Fullstack":["Next.js", "NuxtJS", "SvelteKit", "Khác"],
        "Service":  ["Node.js Worker", "Python Script", "Bash / Shell", "Khác"],
    }
    fw_default = ["Khác"]
    fw_choices = fw_map.get(proj_type, fw_default)
    framework = _pick("Framework", fw_choices)

    cwd = Prompt.ask("Đường dẫn tuyệt đối (cwd)", default=os.getcwd())

    # Smart defaults by framework
    def_script, def_args = "npm", "run dev"
    fw = framework or ""
    if "Rails" in fw:
        def_script, def_args = "bash", "-c 'source .env.development && rails server -p 3000'"
    elif "Django" in fw or "FastAPI" in fw:
        def_script, def_args = "python3", "manage.py runserver"
    elif fw in ("NestJS",):
        def_args = "run start:dev"
    elif "React (CRA)" in fw:
        def_args = "start"

    script = Prompt.ask("Execution script",  default=def_script)
    args   = Prompt.ask("Arguments / flags", default=def_args)
    port   = Prompt.ask("Port (env PORT, bỏ trống nếu không cần)", default="")

    console.print("\n[bold]PM2 Advanced Options[/bold]  [dim](Enter để bỏ qua)[/dim]")

    max_mem = Prompt.ask(
        "Max memory trước khi auto‑restart  [dim](e.g. 512M, 1G — trống = không giới hạn)[/dim]",
        default=""
    )

    exec_modes = ["fork", "cluster"]
    exec_mode  = _pick("Execution mode (cluster cho multi‑worker)", exec_modes)

    instances = 1
    if exec_mode == "cluster":
        instances_str = Prompt.ask(
            "Số worker instances  [dim](nhập 0 = max CPU cores)[/dim]", default="0"
        )
        try:
            instances = int(instances_str) if int(instances_str) > 0 else "max"
        except Exception:
            instances = "max"

    kill_timeout  = int(Prompt.ask("Kill timeout (ms) trước khi force‑kill", default="3000") or 3000)
    restart_delay = int(Prompt.ask("Delay giữa các lần restart (ms)", default="0") or 0)
    autorestart   = Confirm.ask("Auto‑restart khi crash?", default=True)
    watch         = Confirm.ask("Watch mode (restart khi có file thay đổi)?", default=False)

    env: dict = {}
    if port:
        env["PORT"] = port
    fw = framework or ""
    if "Rails" in fw:
        env.setdefault("RAILS_ENV", "development")
    if "Django" in fw or "FastAPI" in fw:
        env.setdefault("DJANGO_ENV", "development")

    app = {
        "name": name, "type": proj_type, "framework": framework,
        "cwd": cwd, "script": script, "args": args, "env": env,
        "autorestart": autorestart, "watch": watch,
        "exec_mode": exec_mode,
        "instances": instances,
        "max_memory_restart": max_mem,
        "kill_timeout": kill_timeout,
        "restart_delay": restart_delay,
    }

    apps = load_apps()
    apps = [a for a in apps if a["name"] != name]
    apps.append(app)
    save_apps(apps)

    console.print(f"\n[green]✓  Đã lưu dự án [bold]{name}[/bold][/green]")
    if exec_mode == "cluster":
        console.print(f"[dim]   Cluster mode — {instances} worker(s)[/dim]")
    if max_mem:
        console.print(f"[dim]   Auto‑restart khi RAM > {max_mem}[/dim]")
    console.print()

def cmd_list():
    if not check_pm2(): return
    apps   = load_apps()
    pm2map = get_pm2_status()

    t = Table(
        title="[bold]Dự án — PM2 Status[/bold]",
        box=box.ROUNDED, padding=(0, 1), show_lines=False
    )
    t.add_column("#",         style="dim",         justify="right", width=3)
    t.add_column("Tên",       style="bold cyan",   no_wrap=True)
    t.add_column("Type",      style="dim white",   width=10)
    t.add_column("Framework", style="white",       width=12)
    t.add_column("Mode",      justify="center",    width=8)
    t.add_column("Trạng thái",justify="center",    width=12)
    t.add_column("RAM",       justify="right",     width=9)
    t.add_column("CPU",       justify="right",     width=7)
    t.add_column("PID",       justify="right",     width=7)

    if not apps:
        console.print("[yellow]Chưa có dự án. Dùng /add để thêm.[/yellow]\n")
        return

    for i, a in enumerate(apps, 1):
        p      = pm2map.get(a["name"], {})
        env    = p.get("pm2_env", {})
        status = env.get("status", "stopped")
        monit  = p.get("monit") or {}
        mem    = monit.get("memory", 0) / (1024*1024)
        cpu    = monit.get("cpu", 0)
        pid    = p.get("pid") or "—"
        mode   = a.get("exec_mode", "fork")
        insts  = a.get("instances", 1)
        mode_str = f"[blue]cluster×{insts}[/blue]" if mode == "cluster" else "[dim]fork[/dim]"
        t.add_row(
            str(i), a["name"],
            a.get("type","—"), a.get("framework","—"),
            mode_str,
            _status_text(status),
            f"{mem:.1f} MB" if mem else "—",
            f"{cpu}%" if cpu else "—",
            str(pid),
        )
    console.print(t)
    console.print("[dim]  Dùng /info <tên> để xem cấu hình đầy đủ.[/dim]\n")

def cmd_info(arg=""):
    apps = load_apps()
    name = arg.strip()
    if not name:
        name = _pick_app("xem chi tiết")
        if not name: return

    app = next((a for a in apps if a["name"] == name), None)
    if not app:
        console.print(f"[red]Không tìm thấy dự án: {name}[/red]\n")
        return

    pm2map  = get_pm2_status() if check_pm2() else {}
    p       = pm2map.get(name, {})
    env_pm2 = p.get("pm2_env", {})
    monit   = p.get("monit") or {}
    status  = env_pm2.get("status", "stopped")
    mem     = monit.get("memory", 0) / (1024*1024)
    cpu     = monit.get("cpu", 0)
    pid     = p.get("pid")
    restarts= env_pm2.get("restart_time", 0)
    uptime_ms = env_pm2.get("pm_uptime")
    uptime_str = "—"
    if uptime_ms and status == "online":
        secs   = (datetime.now().timestamp() * 1000 - uptime_ms) / 1000
        h, rem = divmod(int(secs), 3600)
        m, s   = divmod(rem, 60)
        uptime_str = f"{h}h {m}m {s}s"

    rows = [
        ("Tên dự án",   app["name"]),
        ("Loại",        app.get("type","—")),
        ("Framework",   app.get("framework","—")),
        ("Thư mục",     app.get("cwd","—")),
        ("Script",      app.get("script","npm")),
        ("Arguments",   app.get("args","—")),
        ("Exec mode",   app.get("exec_mode","fork")),
        ("Workers",     str(app.get("instances",1))),
        ("Max RAM",     app.get("max_memory_restart","không giới hạn") or "không giới hạn"),
        ("Kill timeout",f"{app.get('kill_timeout',3000)} ms"),
        ("Restart delay",f"{app.get('restart_delay',0)} ms"),
        ("Auto-restart",str(app.get("autorestart",True))),
        ("Watch mode",  str(app.get("watch",False))),
        ("Env vars",    json.dumps(app.get("env",{}), ensure_ascii=False)),
    ]
    pm2_rows = [
        ("Trạng thái",  _status_text(status)),
        ("PID",         str(pid) if pid else "—"),
        ("RAM hiện tại",f"{mem:.1f} MB" if mem else "—"),
        ("CPU",         f"{cpu}%" if cpu else "—"),
        ("Uptime",      uptime_str),
        ("Restarts",    str(restarts)),
    ]

    t = Table(box=box.SIMPLE, show_header=False, padding=(0,2))
    t.add_column("Key",   style="dim cyan", no_wrap=True)
    t.add_column("Value", style="white")
    for k, v in rows:
        t.add_row(k, v)

    t2 = Table(box=box.SIMPLE, show_header=False, padding=(0,2))
    t2.add_column("Key",   style="dim cyan", no_wrap=True)
    t2.add_column("Value", style="white")
    for k, v in pm2_rows:
        t2.add_row(k, v)

    console.print(Panel(t,  title=f"[bold]Config — {name}[/bold]",    border_style="white", padding=(0,1)))
    console.print(Panel(t2, title=f"[bold]PM2 Runtime — {name}[/bold]", border_style="dim",   padding=(0,1)))
    console.print()

def cmd_dev(arg=""):
    if not check_pm2(): return
    name = arg.strip() or _pick_app("khởi chạy")
    if not name: return
    if name.upper() == "ALL":
        console.print("[cyan]➜ Khởi chạy tất cả...[/cyan]")
        subprocess.run(["pm2", "start", str(PM2_CONFIG)], capture_output=True)
        console.print("[green]✓ Đã khởi chạy tất cả.[/green]\n")
    else:
        console.print(f"[cyan]➜ Khởi chạy [bold]{name}[/bold]...[/cyan]")
        subprocess.run(["pm2", "start", str(PM2_CONFIG), "--only", name], capture_output=True)
        console.print(f"[green]✓ Khởi chạy xong.[/green]\n")

def cmd_stop(arg=""):
    if not check_pm2(): return
    name = arg.strip() or _pick_app("dừng")
    if not name: return
    if name.upper() == "ALL":
        console.print("[cyan]➜ Dừng tất cả...[/cyan]")
        subprocess.run(["pm2", "stop", "all"], capture_output=True)
    else:
        console.print(f"[cyan]➜ Dừng [bold]{name}[/bold]...[/cyan]")
        subprocess.run(["pm2", "stop", name], capture_output=True)
    console.print("[blue]■ Đã dừng.[/blue]\n")

def cmd_restart(arg=""):
    if not check_pm2(): return
    name = arg.strip() or _pick_app("restart")
    if not name: return
    if name.upper() == "ALL":
        subprocess.run(["pm2", "restart", "all"], capture_output=True)
    else:
        subprocess.run(["pm2", "restart", name], capture_output=True)
    console.print(f"[green]↺ Đã restart [bold]{name}[/bold].[/green]\n")

def cmd_logs(arg=""):
    if not check_pm2(): return
    name = arg.strip() or _pick_app("xem logs")
    if not name: return
    console.print(f"[cyan]➜ Live logs: [bold]{name}[/bold]  [dim](Ctrl+C để thoát)[/dim][/cyan]\n")
    try:
        subprocess.run(["pm2", "logs", name, "--lines", "50", "--raw"])
    except KeyboardInterrupt:
        pass
    console.print()

def cmd_remove(arg=""):
    name = arg.strip() or _pick_app("xoá")
    if not name: return
    if not Confirm.ask(f"Xoá dự án [bold]{name}[/bold] khỏi config?", default=False):
        return
    apps = [a for a in load_apps() if a["name"] != name]
    save_apps(apps)
    if check_pm2():
        subprocess.run(["pm2", "delete", name], capture_output=True)
    console.print(f"[red]✗ Đã xoá [bold]{name}[/bold].[/red]\n")

# ─── Init & Main Loop ─────────────────────────────────────────

HANDLER = {
    "add": cmd_add, "list": cmd_list, "info": cmd_info,
    "dev": cmd_dev, "stop": cmd_stop, "restart": cmd_restart,
    "logs": cmd_logs, "remove": cmd_remove, "help": print_help,
    "start": cmd_dev, "end": cmd_stop,
}

def init():
    if not APPS_FILE.exists():
        save_apps([
            {
                "name": "crm-portal-api",
                "type": "Backend", "framework": "Ruby on Rails",
                "cwd": "/Users/ducanh/Desktop/Pebsteel/portal/crm-portal-api",
                "script": "bash",
                "args": "-c 'source .env.development && rails server -p 3000'",
                "env": {"RAILS_ENV": "development"},
                "autorestart": True, "watch": False,
                "exec_mode": "fork", "instances": 1,
                "max_memory_restart": "512M",
                "kill_timeout": 5000, "restart_delay": 1000,
            },
            {
                "name": "crm-portal-api-sidekiq",
                "type": "Service", "framework": "Ruby on Rails",
                "cwd": "/Users/ducanh/Desktop/Pebsteel/portal/crm-portal-api",
                "script": "sh",
                "args": '-c "source .env.development && bundle exec sidekiq -C config/sidekiq.yml"',
                "env": {"RAILS_ENV": "development"},
                "autorestart": True, "watch": False,
                "exec_mode": "fork", "instances": 1,
                "max_memory_restart": "256M",
                "kill_timeout": 3000, "restart_delay": 0,
            },
            {
                "name": "crm-portal-frontend",
                "type": "Frontend", "framework": "React (CRA)",
                "cwd": "/Users/ducanh/Desktop/Pebsteel/portal/crm-portal-frontend",
                "script": "npm", "args": "run start",
                "env": {"PORT": "3030"},
                "autorestart": True, "watch": False,
                "exec_mode": "fork", "instances": 1,
                "max_memory_restart": "512M",
                "kill_timeout": 3000, "restart_delay": 0,
            },
        ])

if __name__ == "__main__":
    init()
    
    # Handle command-line arguments (Non-interactive mode)
    if len(sys.argv) > 1:
        raw = " ".join(sys.argv[1:])
        if not raw.startswith("/"):
            raw = "/" + raw
            
        parts = raw.split(None, 1)
        cmd   = parts[0].lower().lstrip("/")
        arg   = parts[1] if len(parts) > 1 else ""

        if cmd in HANDLER:
            try:
                fn = HANDLER[cmd]
                import inspect
                sig = inspect.signature(fn)
                if len(sig.parameters) > 0:
                    fn(arg)
                else:
                    fn()
                sys.exit(0)
            except Exception as e:
                console.print(f"[red]Lỗi: {e}[/red]")
                sys.exit(1)
        else:
            console.print(f"[red]Lệnh không hợp lệ: /{cmd}[/red]")
            sys.exit(1)

    # Interactive mode
    print_header()
    print_help()

    while True:
        try:
            raw = pt_session.prompt(
                HTML("<bold><ansiyellow>  ▸ </ansiyellow></bold><bold><ansiwhite>Lệnh: </ansiwhite></bold>")
            ).strip()
        except (KeyboardInterrupt, EOFError):
            console.print("\n[dim]  Tạm biệt! 👋[/dim]\n")
            break

        if not raw:
            continue

        if not raw.startswith("/"):
            console.print("[dim]Hãy gõ lệnh bắt đầu bằng /  (ví dụ: /list, /add)[/dim]")
            continue

        parts = raw.split(None, 1)
        cmd   = parts[0].lower().lstrip("/")
        arg   = parts[1] if len(parts) > 1 else ""

        if cmd in ("exit", "quit", "q"):
            console.print("\n[dim]  Tạm biệt! 👋[/dim]\n")
            break
        elif cmd in HANDLER:
            try:
                fn = HANDLER[cmd]
                import inspect
                sig = inspect.signature(fn)
                if len(sig.parameters) > 0:
                    fn(arg)
                else:
                    fn()
            except Exception as e:
                console.print(f"[red]Lỗi: {e}[/red]")
        else:
            console.print(f"[red]Lệnh không hợp lệ: /{cmd}[/red]  [dim](gõ /help để xem danh sách)[/dim]")
