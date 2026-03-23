const http = require('http');
const fs = require('fs');
const { execSync, exec } = require('child_process');

const PORT = 3034;
const packageJsonPath = './package.json';

// Trả về HTML được nhúng Tailwind CDN
const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CLI Configuration</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    </style>
</head>
<body class="bg-gray-50 text-gray-900 h-screen flex items-center justify-center selection:bg-black selection:text-white">
    <div class="bg-white p-10 rounded-2xl shadow-sm border border-gray-200 w-full max-w-md transition-all duration-300 relative overflow-hidden">
        
        <!-- Setup Form -->
        <div id="formState" class="block transition-all duration-500">
            <div class="mb-8">
                <h1 class="text-2xl font-bold tracking-tight mb-2">Setup CLI</h1>
                <p class="text-sm text-gray-500">Configure your workspace and global CLI tool name locally.</p>
            </div>
            
            <form id="setupForm" class="space-y-5">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
                    <input type="text" id="orgName" placeholder="e.g. da-tools" required autocomplete="off"
                        class="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all">
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">CLI Command</label>
                    <input type="text" id="cliName" placeholder="e.g. da-cli" required autocomplete="off"
                        class="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all">
                </div>

                <div id="alertBox" class="hidden p-3 rounded-lg text-sm border"></div>

                <button type="submit" id="submitBtn"
                    class="w-full bg-black text-white font-medium py-2.5 rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-4 focus:ring-gray-300 transition-all flex justify-center items-center gap-2 mt-4">
                    <span id="btnText">Save & Install</span>
                    <svg id="spinner" class="animate-spin hidden h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                </button>
            </form>
        </div>

        <!-- Success State -->
        <div id="successState" class="hidden text-center py-6 animate-[fadeIn_0.5s_ease-out]">
            <div class="w-16 h-16 bg-black rounded-full flex items-center justify-center mx-auto mb-5">
                <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <h2 class="text-2xl font-bold mb-2">Successfully Linked</h2>
            <p class="text-gray-500 text-sm mb-6">Your tool is ready to use globally.</p>
            <div class="bg-gray-100 p-4 rounded-xl text-sm font-mono text-gray-800 border border-gray-200 text-left">
                <span class="text-gray-400">$ </span><span id="finalCommand" class="font-bold text-black"></span>
            </div>
            <p class="text-gray-400 text-xs mt-6">You can safely close this window.</p>
        </div>
    </div>

    <style>
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    </style>

    <script>
        const form = document.getElementById('setupForm');
        const submitBtn = document.getElementById('submitBtn');
        const btnText = document.getElementById('btnText');
        const spinner = document.getElementById('spinner');
        const alertBox = document.getElementById('alertBox');
        
        let preventDefaultSubmission = false;

        const showAlert = (msg, isError = true) => {
            alertBox.classList.remove('hidden', 'bg-red-50', 'text-red-700', 'border-red-200', 'bg-yellow-50', 'text-yellow-700', 'border-yellow-200');
            alertBox.classList.add(isError ? 'bg-red-50' : 'bg-yellow-50');
            alertBox.classList.add(isError ? 'text-red-700' : 'text-yellow-700');
            alertBox.classList.add(isError ? 'border-red-200' : 'border-yellow-200');
            alertBox.textContent = msg;
        };

        const setLoading = (isLoading) => {
            if (isLoading) {
                spinner.classList.remove('hidden');
                submitBtn.disabled = true;
                submitBtn.classList.add('opacity-70');
                document.getElementById('orgName').disabled = true;
                document.getElementById('cliName').disabled = true;
            } else {
                spinner.classList.add('hidden');
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-70');
                document.getElementById('orgName').disabled = false;
                document.getElementById('cliName').disabled = false;
            }
        };

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            alertBox.classList.add('hidden');
            
            const orgName = document.getElementById('orgName').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
            const cliName = document.getElementById('cliName').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
            
            if(!orgName || !cliName) return showAlert('Invalid format. Use only letters, numbers and hyphens.');

            setLoading(true);
            btnText.textContent = 'Verifying with NPM...';

            try {
                const res = await fetch('/api/setup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orgName, cliName, force: preventDefaultSubmission })
                });
                
                const data = await res.json();
                
                if (res.ok) {
                    document.getElementById('formState').style.display = 'none';
                    document.getElementById('successState').classList.remove('hidden');
                    document.getElementById('finalCommand').textContent = cliName;
                } else if (res.status === 409) {
                    showAlert(data.message, false);
                    btnText.textContent = 'Force Install Locally';
                    preventDefaultSubmission = true; 
                    setLoading(false);
                } else {
                    showAlert(data.error || 'Server error', true);
                    setLoading(false);
                }
            } catch (err) {
                showAlert('Network error. Check terminal logs.', true);
                setLoading(false);
            }
        });

        // Tự động clear trạng thái force nếu user đổi typing name
        document.getElementById('orgName').addEventListener('input', () => { preventDefaultSubmission = false; btnText.textContent = 'Save & Install'; });
        document.getElementById('cliName').addEventListener('input', () => { preventDefaultSubmission = false; btnText.textContent = 'Save & Install'; });
    </script>
</body>
</html>
`;

// Hàm Check trên NPM
function checkNpmPackage(packageName) {
    try {
        execSync(`npm view ${packageName} version`, { stdio: 'pipe' });
        return true; // Bị trùng
    } catch {
        return false; // Free
    }
}

// Chạy Server Local
const server = http.createServer((req, res) => {
    // Route 1: View HTML
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(htmlContent);
    } 
    // Route 2: API xử lý thao tác
    else if (req.url === '/api/setup' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const data = JSON.parse(body);
            const fullName = `@${data.orgName}/${data.cliName}`;

            // Check NPM (Sẽ bỏ qua nếu User bấm Force Install)
            if (!data.force) {
                if (checkNpmPackage(fullName)) {
                    res.writeHead(409, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ message: `Gói ${fullName} đã được đăng ký ngoài NPM! Bấm Force Install để cài đè nội bộ.` }));
                }
            }

            // Ghi file và chạy lệnh Terminal
            try {
                console.log(`\n⏳  Đang cấu hình và cài đặt lệnh [${data.cliName}] vào hệ thống...`);
                let pkgData;
                try {
                    pkgData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                } catch(e) {
                    throw new Error("Không thể đọc package.json ở thư mục hiện tại!");
                }
                
                const oldBinName = pkgData.bin ? Object.keys(pkgData.bin)[0] : null;

                pkgData.name = fullName;
                pkgData.bin = {};
                pkgData.bin[data.cliName] = "./cli";
                
                pkgData.scripts = pkgData.scripts || {};
                if (oldBinName && pkgData.scripts[oldBinName] && oldBinName !== data.cliName) {
                    delete pkgData.scripts[oldBinName];
                }
                pkgData.scripts[data.cliName] = "./cli";

                // Ghi thay đổi
                fs.writeFileSync(packageJsonPath, JSON.stringify(pkgData, null, 2));

                // Thực thi unlink & link
                try { execSync('npm unlink', { stdio: 'ignore' }); } catch(e){}
                execSync('npm link', { stdio: 'ignore' });

                // Trả response cho trình duyệt
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));

                console.log(`✅  HOÀN QUẤT: Đã cài hoàn thành (${fullName}).`);
                console.log(`👉  Sử dụng Terminal với lệnh: ${data.cliName}`);
                console.log(`Đang tự động tắt máy chủ nội bộ... (Có thể đóng trình duyệt!)\n`);
                
                // Tắt Terminal Server sau 2s
                setTimeout(() => process.exit(0), 1000);

            } catch (err) {
                console.error("❌ Lỗi cấu hình hệ thống: ", err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(PORT, () => {
    console.log(`\n🚀 Pop-up GUI Setup is running! Đang mở trình duyệt... (http://localhost:${PORT})`);
    
    // Auto mở popup thay vì gõ tay
    try {
        if (process.platform === 'darwin') {
            execSync(`open http://localhost:${PORT}`);
        } else if (process.platform === 'win32') {
            execSync(`start http://localhost:${PORT}`);
        } else {
            execSync(`xdg-open http://localhost:${PORT}`);
        }
    } catch(e) {
         console.log(`Bạn hãy mở Tab mới trỏ tới: http://localhost:${PORT} nếu máy không tự động phản hồi!`);
    }
});
