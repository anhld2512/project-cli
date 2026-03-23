# Project CLI Toolkit

> Workspace management for developers who run many things at once.  
> Quản trị không gian làm việc cho developer vận hành nhiều dự án cùng lúc.

[![Version](https://img.shields.io/badge/version-1.0.0-black?style=flat-square)](https://datools.info)
[![Status](https://img.shields.io/badge/status-stable-brightgreen?style=flat-square)](https://datools.info)


---

## What it does / Công cụ này làm gì

Thay vì mở hàng chục terminal để quản lý từng service, **Project CLI Toolkit** tập trung mọi thứ về một chỗ — khởi động, dừng, theo dõi log, giám sát tài nguyên — thông qua Web Dashboard hoặc Terminal CLI, đều được vận hành bởi PM2.

Instead of juggling a dozen terminals, this toolkit centralizes everything — start, stop, monitor logs, track resources — via a Web Dashboard or Terminal CLI, all powered by PM2.

---

## Features / Tính năng

### Web Dashboard — `localhost:3035`

| Feature | Description |
|---|---|
| Project Scan | Tự động nhận diện NextJS, NestJS, Rails, Django, ... |
| Real-time Logs | Xem log mọi service trực tiếp trên trình duyệt |
| PM2 Config | Chỉnh RAM limit, Cluster mode, Instances qua UI |
| System Monitor | Theo dõi CPU / RAM theo thời gian thực |

Bảo mật bằng JWT. Không cần cấu hình thêm sau khi cài đặt.  
Secured with JWT. No extra setup needed after install.

### Terminal CLI

```bash
project-cli start all          # Khởi động toàn bộ service
project-cli stop my-api        # Dừng một service cụ thể
project-cli logs frontend      # Xem log theo tên project
```

Hỗ trợ tab-completion, non-interactive mode, và Python VENV tự động.  
Supports tab-completion, non-interactive mode, and auto Python VENV setup.

---

## Installation / Cài đặt

**Yêu cầu / Requirements:** Node.js v18+

```bash
# 1. Cài PM2 toàn cục / Install PM2 globally
npm install -g pm2

# 2. Vào thư mục dự án / Navigate to project directory
cd Project-CLI

# 3. Cài đặt dependency / Install dependencies
npm install

# 4. Đăng ký lệnh toàn cục / Register global commands
npm link --force
```

Sau bước này, `project-cli` và `project-terminal` hoạt động từ bất kỳ đâu trên máy.  
After this, `project-cli` and `project-terminal` work from anywhere on your machine.

---

## Usage / Sử dụng

```bash
project-cli           # Bật Web Dashboard / Start Web Dashboard
project-cli end       # Tắt Dashboard / Stop Dashboard
project-terminal      # Mở Terminal CLI / Open Terminal CLI
```

---

## Project structure / Cấu trúc

```
Project-CLI/
├── flow/
│   └── project_flow.xml    # Tài liệu kỹ thuật / Technical spec
├── src/
└── package.json
```

Luồng kỹ thuật chi tiết được mô tả trong `./flow/project_flow.xml`.  
Full technical flow is documented in `./flow/project_flow.xml`.

---

## Author / Tác giả
 
Built by tools that help developers focus on what matters.

---

*© 2026 . All rights reserved.*