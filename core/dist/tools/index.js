"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tools = void 0;
const zod_1 = require("zod");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const db_1 = require("../memory/db");
const node_fetch_1 = __importDefault(require("node-fetch"));
const os_1 = __importDefault(require("os"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// 🖥️ 크로스 플랫폼 지원
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';
const homeDir = os_1.default.homedir();
// 플랫폼별 기본 경로
const getDefaultPaths = () => {
    if (isWindows) {
        return [
            `${homeDir}/Desktop`,
            `${homeDir}/Documents`,
            `${homeDir}/Downloads`,
            `${homeDir}/Pictures`,
            `${homeDir}/Videos`,
            `${homeDir}/Music`
        ].map(p => p.replace(/\\/g, '/'));
    }
    else {
        // macOS / Linux
        return [
            `${homeDir}/Desktop`,
            `${homeDir}/Documents`,
            `${homeDir}/Downloads`,
            `${homeDir}/Pictures`,
            `${homeDir}/Movies`,
            `${homeDir}/Music`
        ];
    }
};
const ALLOW_DIR = (process.env.ALLOW_DIR || "").replace(/\\/g, "/");
function inAllow(p) {
    const norm = path_1.default.resolve(p).replace(/\\/g, "/");
    console.log('경로 검사:', p, '-> 정규화:', norm);
    // 기본 허용 경로들 (플랫폼별)
    const defaultAllowedPaths = getDefaultPaths();
    // ALLOW_DIR이 설정되어 있으면 추가 경로들 파싱 (세미콜론 또는 쉼표로 구분)
    let additionalPaths = [];
    if (ALLOW_DIR) {
        console.log('ALLOW_DIR 설정됨:', ALLOW_DIR);
        additionalPaths = ALLOW_DIR.split(/[;,]/)
            .map(dir => dir.trim())
            .filter(dir => dir.length > 0)
            .map(dir => path_1.default.resolve(dir).replace(/\\/g, "/"));
        console.log('추가 허용 경로들:', additionalPaths);
    }
    // 모든 허용 경로 합치기
    const allAllowedPaths = [...defaultAllowedPaths, ...additionalPaths];
    console.log('전체 허용 경로들:', allAllowedPaths);
    const result = allAllowedPaths.some(allowedPath => {
        const resolvedPath = path_1.default.resolve(allowedPath).replace(/\\/g, "/");
        console.log('비교:', norm, 'startsWith', resolvedPath, '=', norm.startsWith(resolvedPath));
        return norm.startsWith(resolvedPath);
    });
    // 데스크톱 경로는 항상 허용 (최우선 안전장치)
    if (norm.includes('/Desktop/') || norm.includes('\\Desktop\\')) {
        console.log('데스크톱 경로로 인식, 강제 허용');
        return true;
    }
    console.log('최종 결과:', result);
    return result;
}
// 🖥️ macOS 프로그램 실행 함수
async function launchProgramMac(programName) {
    console.log(`[macOS] 프로그램 검색: "${programName}"`);
    // macOS 별명 매핑
    const MAC_ALIASES = {
        '카카오톡': 'KakaoTalk',
        '카톡': 'KakaoTalk',
        '크롬': 'Google Chrome',
        '사파리': 'Safari',
        '파인더': 'Finder',
        '터미널': 'Terminal',
        '메모': 'Notes',
        '캘린더': 'Calendar',
        '음악': 'Music',
        '사진': 'Photos',
        '메일': 'Mail',
        '디스코드': 'Discord',
        '디코': 'Discord',
        '슬랙': 'Slack',
        '줌': 'zoom.us',
        'vs코드': 'Visual Studio Code',
        '비주얼': 'Visual Studio Code',
        '파이참': 'PyCharm',
        '엑셀': 'Microsoft Excel',
        '워드': 'Microsoft Word',
        '파워포인트': 'Microsoft PowerPoint',
        '피그마': 'Figma',
        '스팀': 'Steam',
        '계산기': 'Calculator',
        '미리보기': 'Preview',
        '시스템설정': 'System Preferences',
    };
    // 별명 변환
    const appName = MAC_ALIASES[programName] || MAC_ALIASES[programName.toLowerCase()] || programName;
    try {
        // 1. open -a 로 앱 실행 시도
        const proc = (0, child_process_1.spawn)('open', ['-a', appName], {
            detached: true,
            stdio: 'ignore'
        });
        proc.unref();
        await new Promise(resolve => setTimeout(resolve, 500));
        return {
            success: true,
            programName: appName,
            message: `'${appName}' 앱을 실행했습니다.`
        };
    }
    catch (error) {
        // 2. mdfind로 앱 검색 후 실행
        try {
            const { stdout } = await execAsync(`mdfind "kMDItemKind == 'Application'" | grep -i "${appName}" | head -1`);
            const appPath = stdout.trim();
            if (appPath) {
                const proc = (0, child_process_1.spawn)('open', [appPath], { detached: true, stdio: 'ignore' });
                proc.unref();
                return {
                    success: true,
                    programName: appName,
                    path: appPath,
                    message: `'${appName}' 앱을 실행했습니다.`
                };
            }
        }
        catch {
            // 검색 실패
        }
        return {
            success: false,
            programName: appName,
            message: `'${appName}' 앱을 찾을 수 없습니다.`
        };
    }
}
// 🖥️ Linux 프로그램 실행 함수
async function launchProgramLinux(programName) {
    console.log(`[Linux] 프로그램 검색: "${programName}"`);
    // Linux 별명 매핑
    const LINUX_ALIASES = {
        '크롬': 'google-chrome',
        '파이어폭스': 'firefox',
        '파폭': 'firefox',
        '터미널': 'gnome-terminal',
        '파일관리자': 'nautilus',
        '계산기': 'gnome-calculator',
        '텍스트편집기': 'gedit',
        'vs코드': 'code',
        '비주얼': 'code',
        '디스코드': 'discord',
        '디코': 'discord',
        '슬랙': 'slack',
        '스팀': 'steam',
    };
    const cmdName = LINUX_ALIASES[programName] || LINUX_ALIASES[programName.toLowerCase()] || programName.toLowerCase();
    try {
        // which로 실행 파일 확인
        const { stdout } = await execAsync(`which ${cmdName}`);
        const execPath = stdout.trim();
        if (execPath) {
            const proc = (0, child_process_1.spawn)(cmdName, [], {
                detached: true,
                stdio: 'ignore',
                shell: true
            });
            proc.unref();
            return {
                success: true,
                programName: cmdName,
                path: execPath,
                message: `'${cmdName}' 프로그램을 실행했습니다.`
            };
        }
        return {
            success: false,
            programName: cmdName,
            message: `'${cmdName}' 프로그램을 찾을 수 없습니다.`
        };
    }
    catch {
        return {
            success: false,
            programName: cmdName,
            message: `'${cmdName}' 프로그램을 찾을 수 없습니다.`
        };
    }
}
// 허용된 명령어 목록 (최소한의 안전한 명령어들만)
const ALLOWED_COMMANDS = [
    // 읽기/조회성 명령어 (안전)
    'dir', 'ls', 'pwd', 'whoami', 'hostname', 'date', 'time',
    // 시스템 정보 조회
    'systeminfo', 'tasklist',
    // 네트워크 조회
    'ping', 'ipconfig', 'netstat', 'tracert',
    // 기본 유틸리티
    'echo', 'type', 'find', 'grep', 'sort',
    // 파일 탐색기 (폴더 열기용)
    'explorer'
];
// 위험한 명령어 목록 (금지)
const DANGEROUS_COMMANDS = [
    'format', 'del /f', 'rm -rf', 'shutdown', 'restart', 'reboot',
    'reg', 'wmic', 'diskpart', 'bcdedit', 'sfc', 'chkdsk /f',
    'attrib', 'cacls', 'icacls', 'takeown', 'net user', 'net localgroup'
];
// 명령어 안전성 검사
function isCommandSafe(command) {
    const cmd = command.toLowerCase().trim();
    // 위험한 명령어 체크
    for (const dangerous of DANGEROUS_COMMANDS) {
        if (cmd.includes(dangerous.toLowerCase())) {
            return { safe: false, reason: `위험한 명령어가 포함되어 있습니다: ${dangerous}` };
        }
    }
    // 허용된 명령어 체크
    const firstWord = cmd.split(' ')[0];
    const isAllowed = ALLOWED_COMMANDS.some(allowed => firstWord === allowed || cmd.startsWith(allowed + ' '));
    if (!isAllowed) {
        return { safe: false, reason: `허용되지 않은 명령어입니다: ${firstWord}` };
    }
    return { safe: true };
}
// 명령어 실행 함수
async function executeCommand(command, timeout = 30000) {
    return new Promise((resolve) => {
        const child = (0, child_process_1.spawn)('cmd', ['/c', command], {
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        let output = '';
        let error = '';
        child.stdout?.on('data', (data) => {
            output += data.toString();
        });
        child.stderr?.on('data', (data) => {
            error += data.toString();
        });
        child.on('close', (code) => {
            resolve({
                success: code === 0,
                output: output.trim(),
                error: error.trim(),
                exitCode: code || 0
            });
        });
        child.on('error', (err) => {
            resolve({
                success: false,
                output: '',
                error: err.message,
                exitCode: -1
            });
        });
        // 타임아웃 설정
        setTimeout(() => {
            child.kill();
            resolve({
                success: false,
                output: '',
                error: '명령어 실행 시간 초과',
                exitCode: -1
            });
        }, timeout);
    });
}
exports.tools = {
    search_files: {
        schema: zod_1.z.object({
            query: zod_1.z.string(),
            dir: zod_1.z.string().default(ALLOW_DIR),
            maxResults: zod_1.z.number().optional().default(50),
            recursive: zod_1.z.boolean().optional().default(false)
        }),
        async execute({ query, dir, maxResults = 50, recursive = false }) {
            if (!inAllow(dir))
                throw new Error("forbidden dir");
            const results = [];
            const queryLower = query.toLowerCase();
            async function searchDir(currentDir, depth = 0) {
                if (results.length >= maxResults || depth > 2)
                    return; // 최대 2단계 depth만
                try {
                    const entries = await promises_1.default.readdir(currentDir, { withFileTypes: true });
                    for (const entry of entries) {
                        if (results.length >= maxResults)
                            break;
                        const fullPath = path_1.default.join(currentDir, entry.name);
                        // 숨김 파일/폴더 제외
                        if (entry.name.startsWith('.'))
                            continue;
                        if (entry.name.toLowerCase().includes(queryLower)) {
                            results.push(fullPath);
                        }
                        // recursive가 true이고 디렉토리면 하위 검색
                        if (recursive && entry.isDirectory() && depth < 2) {
                            await searchDir(fullPath, depth + 1);
                        }
                    }
                }
                catch (error) {
                    // 권한 없는 폴더는 스킵
                    console.log(`검색 스킵: ${currentDir}`);
                }
            }
            await searchDir(dir);
            return results;
        }
    },
    read_file: {
        schema: zod_1.z.object({ path: zod_1.z.string() }),
        async execute({ path: p }) {
            if (!inAllow(p))
                throw new Error("forbidden path");
            return await promises_1.default.readFile(p, "utf-8");
        }
    },
    // 명령어 실행 도구
    execute_command: {
        schema: zod_1.z.object({
            command: zod_1.z.string(),
            timeout: zod_1.z.number().optional().default(30000)
        }),
        async execute({ command, timeout }) {
            // 안전성 검사
            const safetyCheck = isCommandSafe(command);
            if (!safetyCheck.safe) {
                throw new Error(`명령어 실행이 거부되었습니다: ${safetyCheck.reason}`);
            }
            console.log(`명령어 실행: ${command}`);
            const result = await executeCommand(command, timeout);
            return {
                command,
                success: result.success,
                output: result.output,
                error: result.error,
                exitCode: result.exitCode,
                timestamp: new Date().toISOString()
            };
        }
    },
    // 허용된 명령어 목록 조회
    list_commands: {
        schema: zod_1.z.object({}),
        async execute() {
            return {
                allowed: ALLOWED_COMMANDS,
                dangerous: DANGEROUS_COMMANDS,
                total: ALLOWED_COMMANDS.length
            };
        }
    },
    // 시스템 정보 조회
    system_info: {
        schema: zod_1.z.object({}),
        async execute() {
            const commands = [
                'systeminfo | findstr "OS Name"',
                'systeminfo | findstr "Total Physical Memory"',
                'whoami',
                'hostname',
                'date /t',
                'time /t'
            ];
            const results = [];
            for (const cmd of commands) {
                try {
                    const result = await executeCommand(cmd, 5000);
                    results.push({
                        command: cmd,
                        output: result.output,
                        success: result.success
                    });
                }
                catch (error) {
                    results.push({
                        command: cmd,
                        output: '',
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }
            return results;
        }
    },
    // RAG: 문서 검색
    search_documents: {
        schema: zod_1.z.object({
            query: zod_1.z.string(),
            limit: zod_1.z.number().optional().default(5)
        }),
        async execute({ query, limit }) {
            // 간단한 텍스트 검색 (향후 벡터 검색으로 업그레이드 가능)
            const searchDir = process.env.DOCS_DIR || "./docs";
            try {
                const files = await promises_1.default.readdir(searchDir, { recursive: true });
                const results = [];
                for (const file of files) {
                    if (file.endsWith('.txt') || file.endsWith('.md')) {
                        try {
                            const content = await promises_1.default.readFile(path_1.default.join(searchDir, file), 'utf-8');
                            if (content.toLowerCase().includes(query.toLowerCase())) {
                                results.push({
                                    file,
                                    content: content.substring(0, 200) + '...',
                                    relevance: content.toLowerCase().split(query.toLowerCase()).length - 1
                                });
                            }
                        }
                        catch (error) {
                            // 파일 읽기 실패 시 무시
                        }
                    }
                }
                return results
                    .sort((a, b) => b.relevance - a.relevance)
                    .slice(0, limit);
            }
            catch (error) {
                return [];
            }
        }
    },
    // 정책 점수 업데이트
    update_policy_score: {
        schema: zod_1.z.object({
            tool: zod_1.z.string(),
            intent: zod_1.z.string(),
            success: zod_1.z.boolean()
        }),
        async execute({ tool, intent, success }) {
            // 정책 점수 저장 (향후 데이터베이스에 저장)
            const score = success ? 1 : -1;
            console.log(`정책 점수 업데이트: ${tool} (${intent}) = ${score}`);
            return {
                tool,
                intent,
                score,
                timestamp: new Date().toISOString()
            };
        }
    },
    // 폴더 열기
    open_folder: {
        schema: zod_1.z.object({
            path: zod_1.z.string()
        }),
        async execute({ path: folderPath }) {
            // 보안 검사
            if (!inAllow(folderPath)) {
                throw new Error("허용되지 않은 경로입니다");
            }
            // 이미 최근에 열렸는지 확인 (중복 실행 방지)
            if ((0, db_1.isRecentlyOpened)(folderPath, 2)) {
                return {
                    folder: folderPath,
                    success: true,
                    message: "이미 열려있거나 방금 열렸습니다",
                    error: ""
                };
            }
            // 🖥️ 크로스 플랫폼: 폴더 열기
            let result;
            if (isWindows) {
                const command = `explorer "${folderPath}"`;
                result = await executeCommand(command, 5000);
            }
            else {
                // macOS / Linux
                result = await new Promise((resolve) => {
                    const proc = (0, child_process_1.spawn)('open', [folderPath], { detached: true, stdio: 'ignore' });
                    proc.unref();
                    resolve({ success: true, output: '', error: '' });
                });
            }
            if (result.success) {
                (0, db_1.markOpened)(folderPath, 'folder');
            }
            return {
                folder: folderPath,
                success: result.success,
                message: result.success ? "폴더가 열렸습니다" : "폴더 열기 실패",
                error: result.error
            };
        }
    },
    // 파일 실행
    open_file: {
        schema: zod_1.z.object({
            path: zod_1.z.string()
        }),
        async execute({ path: filePath }) {
            // 보안 검사
            if (!inAllow(filePath)) {
                throw new Error("허용되지 않은 경로입니다");
            }
            // 파일 존재 확인
            try {
                await promises_1.default.access(filePath);
            }
            catch (error) {
                throw new Error("파일을 찾을 수 없습니다");
            }
            // 이미 최근에 열렸는지 확인 (중복 실행 방지)
            if ((0, db_1.isRecentlyOpened)(filePath, 2)) {
                return {
                    file: filePath,
                    success: true,
                    message: "이미 열려있거나 방금 열렸습니다",
                    error: ""
                };
            }
            // 🖥️ 크로스 플랫폼: 파일 실행
            let result;
            if (isWindows) {
                const command = `start "" "${filePath}"`;
                result = await executeCommand(command, 5000);
            }
            else {
                // macOS / Linux
                result = await new Promise((resolve) => {
                    const proc = (0, child_process_1.spawn)('open', [filePath], { detached: true, stdio: 'ignore' });
                    proc.unref();
                    resolve({ success: true, output: '', error: '' });
                });
            }
            if (result.success) {
                (0, db_1.markOpened)(filePath, 'file');
            }
            return {
                file: filePath,
                success: result.success,
                message: result.success ? "파일이 실행되었습니다" : "파일 실행 실패",
                error: result.error
            };
        }
    },
    // 특정 프로그램으로 파일 열기
    open_with: {
        schema: zod_1.z.object({
            filePath: zod_1.z.string(),
            program: zod_1.z.string()
        }),
        async execute({ filePath, program }) {
            // 보안 검사
            if (!inAllow(filePath)) {
                throw new Error("허용되지 않은 경로입니다");
            }
            // 파일 존재 확인
            try {
                await promises_1.default.access(filePath);
            }
            catch (error) {
                throw new Error("파일을 찾을 수 없습니다");
            }
            // 특정 프로그램으로 파일 열기
            const command = `start "" "${program}" "${filePath}"`;
            const result = await executeCommand(command, 5000);
            return {
                file: filePath,
                program,
                success: result.success,
                message: result.success ? "파일이 지정된 프로그램으로 열렸습니다" : "파일 열기 실패",
                error: result.error
            };
        }
    },
    // 웹 검색 도구 (Google Custom Search API)
    web_search: {
        schema: zod_1.z.object({
            query: zod_1.z.string(),
            maxResults: zod_1.z.number().optional().default(5)
        }),
        async execute({ query, maxResults = 5 }) {
            const GOOGLE_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyBfP5MTl0LvryqvuGsvZd9M1Tj08dUHPDM";
            const SEARCH_ENGINE_ID = "731b7541a9db4477b";
            try {
                // Google Custom Search API 사용
                const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=${Math.min(maxResults, 10)}`;
                console.log('Google Custom Search 호출:', query);
                const response = await (0, node_fetch_1.default)(searchUrl);
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Google Search API 오류:', response.status, errorText);
                    throw new Error(`Google API 오류: ${response.status}`);
                }
                const data = await response.json();
                const results = [];
                if (data.items && data.items.length > 0) {
                    for (const item of data.items.slice(0, maxResults)) {
                        results.push({
                            title: item.title || "제목 없음",
                            content: item.snippet || "",
                            url: item.link,
                            source: "Google"
                        });
                    }
                }
                console.log(`Google Search 결과: ${results.length}개`);
                return {
                    query,
                    results,
                    total: results.length,
                    source: "Google Custom Search API",
                    success: true
                };
            }
            catch (error) {
                console.error("웹 검색 오류:", error);
                return {
                    query,
                    results: [],
                    total: 0,
                    error: error.message || "웹 검색에 실패했습니다",
                    source: "Google Custom Search API",
                    success: false
                };
            }
        }
    },
    // 뉴스 검색 도구 (Google Custom Search API)
    news_search: {
        schema: zod_1.z.object({
            query: zod_1.z.string(),
            maxResults: zod_1.z.number().optional().default(5)
        }),
        async execute({ query, maxResults = 5 }) {
            const GOOGLE_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyBfP5MTl0LvryqvuGsvZd9M1Tj08dUHPDM";
            const SEARCH_ENGINE_ID = "731b7541a9db4477b";
            try {
                // Google Custom Search API로 뉴스 검색
                const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query + " 뉴스")}&num=${Math.min(maxResults, 10)}`;
                console.log('Google News Search 호출:', query);
                const response = await (0, node_fetch_1.default)(searchUrl);
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Google News API 오류:', response.status, errorText);
                    throw new Error(`Google API 오류: ${response.status}`);
                }
                const data = await response.json();
                const results = [];
                if (data.items && data.items.length > 0) {
                    for (const item of data.items.slice(0, maxResults)) {
                        results.push({
                            title: item.title || "뉴스",
                            content: item.snippet || "",
                            url: item.link,
                            source: "Google News"
                        });
                    }
                }
                console.log(`Google News 결과: ${results.length}개`);
                return {
                    query,
                    results,
                    total: results.length,
                    source: "Google Custom Search API",
                    success: true
                };
            }
            catch (error) {
                console.error("뉴스 검색 오류:", error);
                return {
                    query,
                    results: [],
                    total: 0,
                    error: error.message || "뉴스 검색에 실패했습니다",
                    source: "Google Custom Search API",
                    success: false
                };
            }
        }
    },
    // 스케줄러 도구들
    add_schedule: {
        schema: zod_1.z.object({
            title: zod_1.z.string(),
            date: zod_1.z.string(), // YYYY-MM-DD 형식
            time: zod_1.z.string(), // HH:MM 형식
            description: zod_1.z.string().optional()
        }),
        async execute({ title, date, time, description = "" }) {
            try {
                // 스케줄 데이터를 JSON 파일로 저장
                const scheduleFile = path_1.default.join(process.cwd(), 'data', 'schedules.json');
                // 기존 스케줄 로드
                let schedules = [];
                try {
                    const existingData = await promises_1.default.readFile(scheduleFile, 'utf-8');
                    schedules = JSON.parse(existingData);
                }
                catch (error) {
                    // 파일이 없으면 새로 생성
                    await promises_1.default.mkdir(path_1.default.dirname(scheduleFile), { recursive: true });
                }
                // 새 스케줄 추가
                const newSchedule = {
                    id: Date.now().toString(),
                    title,
                    date,
                    time,
                    description,
                    createdAt: new Date().toISOString()
                };
                schedules.push(newSchedule);
                // 파일에 저장
                await promises_1.default.writeFile(scheduleFile, JSON.stringify(schedules, null, 2));
                return {
                    success: true,
                    schedule: newSchedule,
                    message: `일정이 추가되었습니다: ${title} (${date} ${time})`
                };
            }
            catch (error) {
                console.error("스케줄 추가 오류:", error);
                return {
                    success: false,
                    error: "일정 추가에 실패했습니다"
                };
            }
        }
    },
    get_schedules: {
        schema: zod_1.z.object({
            date: zod_1.z.string().optional(), // 특정 날짜 조회 (YYYY-MM-DD)
            upcoming: zod_1.z.boolean().optional().default(false) // 다가오는 일정만 조회
        }),
        async execute({ date, upcoming = false }) {
            try {
                const scheduleFile = path_1.default.join(process.cwd(), 'data', 'schedules.json');
                let schedules = [];
                try {
                    const data = await promises_1.default.readFile(scheduleFile, 'utf-8');
                    schedules = JSON.parse(data);
                }
                catch (error) {
                    return {
                        schedules: [],
                        total: 0,
                        message: "저장된 일정이 없습니다"
                    };
                }
                let filteredSchedules = schedules;
                // 특정 날짜 필터링
                if (date) {
                    filteredSchedules = schedules.filter(schedule => schedule.date === date);
                }
                // 다가오는 일정만 필터링
                if (upcoming) {
                    const today = new Date().toISOString().split('T')[0];
                    filteredSchedules = schedules.filter(schedule => schedule.date >= today);
                }
                // 날짜순으로 정렬
                filteredSchedules.sort((a, b) => {
                    const dateA = new Date(`${a.date} ${a.time}`);
                    const dateB = new Date(`${b.date} ${b.time}`);
                    return dateA.getTime() - dateB.getTime();
                });
                return {
                    schedules: filteredSchedules,
                    total: filteredSchedules.length,
                    message: date ? `${date} 일정` : upcoming ? "다가오는 일정" : "전체 일정"
                };
            }
            catch (error) {
                console.error("스케줄 조회 오류:", error);
                return {
                    schedules: [],
                    total: 0,
                    error: "일정 조회에 실패했습니다"
                };
            }
        }
    },
    delete_schedule: {
        schema: zod_1.z.object({
            id: zod_1.z.string()
        }),
        async execute({ id }) {
            try {
                const scheduleFile = path_1.default.join(process.cwd(), 'data', 'schedules.json');
                let schedules = [];
                try {
                    const data = await promises_1.default.readFile(scheduleFile, 'utf-8');
                    schedules = JSON.parse(data);
                }
                catch (error) {
                    return {
                        success: false,
                        error: "일정을 찾을 수 없습니다"
                    };
                }
                const originalLength = schedules.length;
                schedules = schedules.filter(schedule => schedule.id !== id);
                if (schedules.length === originalLength) {
                    return {
                        success: false,
                        error: "해당 일정을 찾을 수 없습니다"
                    };
                }
                // 파일에 저장
                await promises_1.default.writeFile(scheduleFile, JSON.stringify(schedules, null, 2));
                return {
                    success: true,
                    message: "일정이 삭제되었습니다"
                };
            }
            catch (error) {
                console.error("스케줄 삭제 오류:", error);
                return {
                    success: false,
                    error: "일정 삭제에 실패했습니다"
                };
            }
        }
    },
    // 리마인더 체크 (1시간 전 알림)
    check_reminders: {
        schema: zod_1.z.object({}),
        async execute() {
            try {
                const scheduleFile = path_1.default.join(process.cwd(), 'data', 'schedules.json');
                let schedules = [];
                try {
                    const data = await promises_1.default.readFile(scheduleFile, 'utf-8');
                    schedules = JSON.parse(data);
                }
                catch (error) {
                    return {
                        reminders: [],
                        expired: [],
                        message: "저장된 일정이 없습니다"
                    };
                }
                const now = new Date();
                const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
                const reminders = [];
                const expired = [];
                for (const schedule of schedules) {
                    const scheduleDateTime = new Date(`${schedule.date} ${schedule.time}`);
                    // 지난 일정 체크 (1시간 지난 일정)
                    if (scheduleDateTime < now) {
                        expired.push(schedule);
                    }
                    // 1시간 전 리마인더 체크
                    else if (scheduleDateTime <= oneHourLater && scheduleDateTime > now) {
                        const timeDiff = Math.floor((scheduleDateTime.getTime() - now.getTime()) / (1000 * 60));
                        reminders.push({
                            ...schedule,
                            minutesUntil: timeDiff
                        });
                    }
                }
                // 지난 일정 자동 삭제
                if (expired.length > 0) {
                    const activeSchedules = schedules.filter(schedule => {
                        const scheduleDateTime = new Date(`${schedule.date} ${schedule.time}`);
                        return scheduleDateTime >= now;
                    });
                    await promises_1.default.writeFile(scheduleFile, JSON.stringify(activeSchedules, null, 2));
                }
                return {
                    reminders,
                    expired: expired.length,
                    message: reminders.length > 0
                        ? `${reminders.length}개의 일정이 곧 시작됩니다`
                        : expired.length > 0
                            ? `${expired.length}개의 지난 일정이 삭제되었습니다`
                            : "리마인더할 일정이 없습니다"
                };
            }
            catch (error) {
                console.error("리마인더 체크 오류:", error);
                return {
                    reminders: [],
                    expired: 0,
                    error: "리마인더 체크에 실패했습니다"
                };
            }
        }
    },
    // 자동 정리 (지난 일정 삭제)
    cleanup_expired_schedules: {
        schema: zod_1.z.object({}),
        async execute() {
            try {
                const scheduleFile = path_1.default.join(process.cwd(), 'data', 'schedules.json');
                let schedules = [];
                try {
                    const data = await promises_1.default.readFile(scheduleFile, 'utf-8');
                    schedules = JSON.parse(data);
                }
                catch (error) {
                    return {
                        success: true,
                        deleted: 0,
                        message: "저장된 일정이 없습니다"
                    };
                }
                const now = new Date();
                const originalLength = schedules.length;
                // 지난 일정 필터링 (1시간 지난 일정)
                const activeSchedules = schedules.filter(schedule => {
                    const scheduleDateTime = new Date(`${schedule.date} ${schedule.time}`);
                    return scheduleDateTime >= now;
                });
                const deletedCount = originalLength - activeSchedules.length;
                // 파일에 저장
                await promises_1.default.writeFile(scheduleFile, JSON.stringify(activeSchedules, null, 2));
                return {
                    success: true,
                    deleted: deletedCount,
                    message: deletedCount > 0
                        ? `${deletedCount}개의 지난 일정이 삭제되었습니다`
                        : "삭제할 지난 일정이 없습니다"
                };
            }
            catch (error) {
                console.error("자동 정리 오류:", error);
                return {
                    success: false,
                    error: "자동 정리에 실패했습니다"
                };
            }
        }
    },
    // 스팀 게임 실행
    launch_steam_game: {
        schema: zod_1.z.object({
            gameId: zod_1.z.string().optional(), // 스팀 게임 ID (AppID)
            gameName: zod_1.z.string().optional() // 게임 이름 (게임 ID를 모를 경우)
        }),
        async execute({ gameId, gameName }) {
            try {
                // 게임 ID가 있으면 직접 실행
                if (gameId) {
                    const command = `start steam://rungameid/${gameId}`;
                    const result = await executeCommand(command, 10000);
                    return {
                        success: result.success,
                        gameId,
                        message: result.success ? `스팀 게임 (ID: ${gameId}) 실행 중...` : "게임 실행 실패",
                        error: result.error
                    };
                }
                // 게임 이름으로 실행하려면 스팀 라이브러리에서 찾아야 함
                if (gameName) {
                    console.log(`게임 검색 시작: "${gameName}"`);
                    // 스팀 설치 경로 찾기
                    const steamInstallPaths = [
                        "C:\\Program Files (x86)\\Steam",
                        "C:\\Program Files\\Steam",
                        process.env.STEAM_PATH || ""
                    ].filter(p => p);
                    // 기본 라이브러리 경로
                    const steamLibraryPaths = [];
                    // 각 스팀 설치 경로에서 라이브러리 찾기
                    for (const installPath of steamInstallPaths) {
                        try {
                            const defaultLibrary = path_1.default.join(installPath, 'steamapps');
                            await promises_1.default.access(defaultLibrary);
                            steamLibraryPaths.push(defaultLibrary);
                            console.log(`기본 라이브러리 발견: ${defaultLibrary}`);
                            // libraryfolders.vdf 파일 읽기 (추가 라이브러리 경로 찾기)
                            const libraryFoldersPath = path_1.default.join(defaultLibrary, 'libraryfolders.vdf');
                            try {
                                const libraryFoldersContent = await promises_1.default.readFile(libraryFoldersPath, 'utf-8');
                                // libraryfolders.vdf에서 경로 추출
                                const pathMatches = libraryFoldersContent.matchAll(/"path"\s+"([^"]+)"/g);
                                for (const match of pathMatches) {
                                    const libraryPath = path_1.default.join(match[1], 'steamapps');
                                    try {
                                        await promises_1.default.access(libraryPath);
                                        steamLibraryPaths.push(libraryPath);
                                        console.log(`추가 라이브러리 발견: ${libraryPath}`);
                                    }
                                    catch {
                                        // 경로 접근 실패 시 무시
                                    }
                                }
                            }
                            catch {
                                // libraryfolders.vdf 읽기 실패 시 무시
                            }
                        }
                        catch {
                            // 설치 경로 접근 실패 시 무시
                            continue;
                        }
                    }
                    // 환경 변수로 지정된 경로 추가
                    if (process.env.STEAM_LIBRARY_PATH) {
                        steamLibraryPaths.push(process.env.STEAM_LIBRARY_PATH);
                    }
                    console.log(`총 ${steamLibraryPaths.length}개의 라이브러리 경로 확인`);
                    let foundGameId = null;
                    let foundGameName = null;
                    const gameNameLower = gameName.toLowerCase().trim();
                    // 스팀 라이브러리에서 게임 찾기
                    for (const libraryPath of steamLibraryPaths) {
                        try {
                            console.log(`라이브러리 검색 중: ${libraryPath}`);
                            // appmanifest_*.acf 파일들 읽기
                            const files = await promises_1.default.readdir(libraryPath);
                            const manifestFiles = files.filter(f => f.startsWith('appmanifest_') && f.endsWith('.acf'));
                            console.log(`${libraryPath}에서 ${manifestFiles.length}개의 게임 매니페스트 발견`);
                            for (const manifestFile of manifestFiles) {
                                try {
                                    const manifestPath = path_1.default.join(libraryPath, manifestFile);
                                    const content = await promises_1.default.readFile(manifestPath, 'utf-8');
                                    // AppID 추출
                                    const appIdMatch = content.match(/"appid"\s+"(\d+)"/);
                                    const nameMatch = content.match(/"name"\s+"([^"]+)"/);
                                    if (appIdMatch && nameMatch) {
                                        const appId = appIdMatch[1];
                                        const installedName = nameMatch[1];
                                        const installedNameLower = installedName.toLowerCase();
                                        // 게임 설치 폴더 이름도 확인 (common 폴더)
                                        let gameFolderName = '';
                                        try {
                                            const commonPath = path_1.default.join(libraryPath, 'common');
                                            const folders = await promises_1.default.readdir(commonPath);
                                            // AppID로 폴더 찾기 (일부 게임은 AppID로 폴더명이 지정됨)
                                            // 또는 installedName으로 폴더 찾기
                                            const matchingFolder = folders.find(folder => {
                                                const folderPath = path_1.default.join(commonPath, folder);
                                                // AppID가 폴더명에 포함되어 있거나, 게임 이름과 유사한 폴더 찾기
                                                return folder.includes(appId) ||
                                                    folder.toLowerCase().includes(installedNameLower) ||
                                                    installedNameLower.includes(folder.toLowerCase());
                                            });
                                            if (matchingFolder) {
                                                gameFolderName = matchingFolder;
                                            }
                                        }
                                        catch {
                                            // common 폴더 접근 실패 시 무시
                                        }
                                        // 디버깅: 매니페스트 이름과 폴더명 모두 출력
                                        console.log(`  [${appId}] 매니페스트: "${installedName}"${gameFolderName ? `, 폴더: "${gameFolderName}"` : ''}`);
                                        // 검색 대상: 매니페스트 이름 + 폴더명 (둘 다 확인)
                                        const gameFolderLower = gameFolderName.toLowerCase();
                                        const allNames = [installedNameLower, gameFolderLower].filter(n => n.length > 0);
                                        // 1. 정확한 일치 (대소문자 무시, 공백 무시) - 매니페스트와 폴더명 모두 확인
                                        const gameNameNormalized = gameNameLower.replace(/\s+/g, '').trim();
                                        for (const nameToCheck of allNames) {
                                            const nameNormalized = nameToCheck.replace(/\s+/g, '').trim();
                                            if (nameNormalized === gameNameNormalized) {
                                                foundGameId = appId;
                                                foundGameName = installedName;
                                                console.log(`✓ [${appId}] 정확한 매칭: "${foundGameName}"`);
                                                break;
                                            }
                                        }
                                        if (foundGameId)
                                            break;
                                        // 2. 포함 관계 확인 (공백 제거 후 비교) - 매니페스트와 폴더명 모두 확인
                                        for (const nameToCheck of allNames) {
                                            const nameNormalized = nameToCheck.replace(/\s+/g, '').trim();
                                            if (nameNormalized.includes(gameNameNormalized) || gameNameNormalized.includes(nameNormalized)) {
                                                foundGameId = appId;
                                                foundGameName = installedName;
                                                console.log(`✓ [${appId}] 포함 매칭: "${foundGameName}" (검색: "${gameName}")`);
                                                break;
                                            }
                                        }
                                        if (foundGameId)
                                            break;
                                        // 3. 한글 단어 기반 매칭 (검색어가 한글인 경우)
                                        const koreanWordRegex = /[가-힣]{2,}/g;
                                        const gameKoreanWords = (gameNameLower.match(koreanWordRegex) || []).map(w => w.trim()).filter(w => w.length >= 2);
                                        if (gameKoreanWords.length > 0) {
                                            // 모든 이름(매니페스트 + 폴더)에서 한글 단어 추출
                                            const allKoreanWords = [];
                                            for (const nameToCheck of allNames) {
                                                const words = (nameToCheck.match(koreanWordRegex) || []).map(w => w.trim()).filter(w => w.length >= 2);
                                                allKoreanWords.push(...words);
                                            }
                                            if (allKoreanWords.length > 0) {
                                                const anyWordMatch = gameKoreanWords.some(gw => allKoreanWords.some(iw => iw.includes(gw) || gw.includes(iw)));
                                                if (anyWordMatch) {
                                                    foundGameId = appId;
                                                    foundGameName = installedName;
                                                    console.log(`✓ [${appId}] 한글 단어 매칭: "${foundGameName}"`);
                                                    break;
                                                }
                                            }
                                            // 4. 한글 검색어와 영어 이름 매칭 (알려진 게임 이름 매핑)
                                            // 간단한 매핑 테이블 사용
                                            const gameNameMapping = {
                                                '이터널 리턴': ['eternal', 'return'],
                                                '이터널리턴': ['eternal', 'return'],
                                                '팰월드': ['palworld'],
                                                '팰월': ['palworld'],
                                                '팔월드': ['palworld'],
                                                '테켄': ['tekken'],
                                                '테켄8': ['tekken', '8'],
                                                '리무스 컴퍼니': ['limbus', 'company'],
                                                '리무스컴퍼니': ['limbus', 'company'],
                                                '레서널 컴퍼니': ['lethal', 'company'],
                                                '레서널컴퍼니': ['lethal', 'company'],
                                                '데이브 더 다이버': ['dave', 'diver'],
                                                '데이브더다이버': ['dave', 'diver'],
                                                '스타듀밸리': ['stardew', 'valley'],
                                                '스타듀': ['stardew'],
                                                '월드 오브 워쉽': ['world', 'warships'],
                                                '월드오브워쉽': ['world', 'warships'],
                                                '뮤즈 대시': ['muse', 'dash'],
                                                '뮤즈대시': ['muse', 'dash'],
                                                '디제이맥스': ['djmax'],
                                                '디제이맥스 리스펙트': ['djmax', 'respect'],
                                                '발하임': ['valheim'],
                                                '홀로큐어': ['holocure'],
                                                '홀로': ['holocure'],
                                                '홀로큐': ['holocure']
                                            };
                                            // 검색어 정규화 (공백 제거)
                                            const normalizedSearch = gameNameLower.replace(/\s+/g, '');
                                            const mappedEnglishWords = gameNameMapping[normalizedSearch] || gameNameMapping[gameNameLower];
                                            if (mappedEnglishWords) {
                                                // 매핑된 영어 단어들이 설치된 게임 이름에 포함되는지 확인
                                                const englishWordRegex = /[a-z]{2,}/g;
                                                const installedEnglishWords = [];
                                                for (const nameToCheck of allNames) {
                                                    const words = (nameToCheck.match(englishWordRegex) || []).map(w => w.trim()).filter(w => w.length >= 2);
                                                    installedEnglishWords.push(...words);
                                                }
                                                const allMappedWordsMatch = mappedEnglishWords.every(mw => installedEnglishWords.some(iw => iw.includes(mw) || mw.includes(iw)));
                                                if (allMappedWordsMatch) {
                                                    foundGameId = appId;
                                                    foundGameName = installedName;
                                                    console.log(`✓ [${appId}] 한글->영어 매핑 매칭: "${foundGameName}"`);
                                                    console.log(`  검색어: "${gameName}" -> 영어: [${mappedEnglishWords.join(', ')}]`);
                                                    break;
                                                }
                                            }
                                        }
                                        // 5. 영어 단어 매칭 (검색어가 영어인 경우)
                                        const englishWordRegex2 = /[a-z]{2,}/g;
                                        const gameEnglishWords2 = (gameNameLower.match(englishWordRegex2) || []).map(w => w.trim()).filter(w => w.length >= 2);
                                        const installedEnglishWords2 = [];
                                        for (const nameToCheck of allNames) {
                                            const words = (nameToCheck.match(englishWordRegex2) || []).map(w => w.trim()).filter(w => w.length >= 2);
                                            installedEnglishWords2.push(...words);
                                        }
                                        if (gameEnglishWords2.length > 0 && installedEnglishWords2.length > 0) {
                                            const englishMatch = gameEnglishWords2.some(gw => installedEnglishWords2.some(iw => iw.includes(gw) || gw.includes(iw)));
                                            if (englishMatch) {
                                                foundGameId = appId;
                                                foundGameName = installedName;
                                                console.log(`✓ [${appId}] 영문 단어 매칭: "${foundGameName}"`);
                                                break;
                                            }
                                        }
                                    }
                                }
                                catch (error) {
                                    // 파일 읽기 실패 시 무시하고 계속
                                    continue;
                                }
                            }
                            if (foundGameId)
                                break;
                        }
                        catch (error) {
                            console.log(`라이브러리 경로 접근 실패: ${libraryPath} - ${error.message}`);
                            continue;
                        }
                    }
                    if (!foundGameId) {
                        console.log(`게임을 찾지 못함: "${gameName}"`);
                    }
                    // 게임을 찾았으면 실행
                    if (foundGameId) {
                        console.log(`게임 실행 시도: steam://rungameid/${foundGameId}`);
                        const command = `start steam://rungameid/${foundGameId}`;
                        const result = await executeCommand(command, 10000);
                        console.log(`게임 실행 결과: success=${result.success}, error=${result.error}`);
                        return {
                            success: result.success,
                            gameId: foundGameId,
                            gameName: foundGameName || gameName,
                            message: result.success
                                ? `'${foundGameName || gameName}' 게임 실행 중... (AppID: ${foundGameId})`
                                : `게임 실행 실패: ${result.error || '알 수 없는 오류'}`,
                            error: result.error
                        };
                    }
                    // 게임을 찾지 못했으면 스팀만 열기
                    const steamPaths = [
                        "C:\\Program Files (x86)\\Steam\\steam.exe",
                        "C:\\Program Files\\Steam\\steam.exe",
                        process.env.STEAM_PATH || ""
                    ].filter(p => p);
                    let steamFound = false;
                    for (const steamPath of steamPaths) {
                        try {
                            await promises_1.default.access(steamPath);
                            const command = `start "" "${steamPath}"`;
                            const result = await executeCommand(command, 5000);
                            if (result.success) {
                                steamFound = true;
                                return {
                                    success: true,
                                    gameName,
                                    message: `스팀을 열어드렸습니다. '${gameName}' 게임을 찾지 못했습니다. 스팀에서 직접 실행해주시기 바랍니다.`,
                                    note: "게임이 설치되어 있지 않거나 이름이 다를 수 있습니다."
                                };
                            }
                        }
                        catch (error) {
                            continue;
                        }
                    }
                    if (!steamFound) {
                        const command = `start steam://`;
                        const result = await executeCommand(command, 5000);
                        return {
                            success: result.success,
                            gameName,
                            message: result.success
                                ? `스팀을 열어드렸습니다. '${gameName}' 게임을 찾지 못했습니다.`
                                : "스팀을 찾을 수 없어요.",
                            error: result.error
                        };
                    }
                }
                return {
                    success: false,
                    error: "게임 ID 또는 게임 이름을 제공해주세요"
                };
            }
            catch (error) {
                console.error("스팀 게임 실행 오류:", error);
                return {
                    success: false,
                    error: `게임 실행 실패: ${error.message}`
                };
            }
        }
    },
    // ===== YouTube API 도구들 =====
    // YouTube 영상 검색
    youtube_search: {
        schema: zod_1.z.object({
            query: zod_1.z.string(),
            maxResults: zod_1.z.number().optional().default(5)
        }),
        async execute({ query, maxResults = 5 }) {
            const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || process.env.GEMINI_API_KEY;
            if (!YOUTUBE_API_KEY) {
                return {
                    success: false,
                    error: "YouTube API 키가 설정되지 않았습니다. .env에 YOUTUBE_API_KEY를 추가하세요."
                };
            }
            try {
                const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`;
                const response = await (0, node_fetch_1.default)(searchUrl);
                const data = await response.json();
                if (data.error) {
                    throw new Error(data.error.message || "YouTube API 오류");
                }
                const videos = (data.items || []).map((item) => ({
                    videoId: item.id?.videoId,
                    title: item.snippet?.title,
                    channel: item.snippet?.channelTitle,
                    description: item.snippet?.description?.substring(0, 100) + '...',
                    thumbnail: item.snippet?.thumbnails?.medium?.url,
                    url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
                    publishedAt: item.snippet?.publishedAt
                }));
                return {
                    success: true,
                    query,
                    results: videos,
                    total: videos.length,
                    message: `"${query}" 검색 결과 ${videos.length}개`
                };
            }
            catch (error) {
                console.error("YouTube 검색 오류:", error);
                return {
                    success: false,
                    query,
                    results: [],
                    error: error.message || "YouTube 검색에 실패했습니다"
                };
            }
        }
    },
    // YouTube 영상 재생 (브라우저에서 열기)
    youtube_play: {
        schema: zod_1.z.object({
            query: zod_1.z.string().optional(),
            videoId: zod_1.z.string().optional(),
            url: zod_1.z.string().optional()
        }),
        async execute({ query, videoId, url }) {
            try {
                let videoUrl = '';
                let videoTitle = '';
                // URL이 직접 제공된 경우
                if (url) {
                    videoUrl = url;
                    videoTitle = 'YouTube 영상';
                }
                // videoId가 제공된 경우
                else if (videoId) {
                    videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
                    videoTitle = 'YouTube 영상';
                }
                // query로 검색해서 첫 번째 결과 재생
                else if (query) {
                    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || process.env.GEMINI_API_KEY;
                    if (!YOUTUBE_API_KEY) {
                        // API 키 없으면 YouTube 검색 페이지로 이동
                        videoUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
                        videoTitle = `"${query}" 검색`;
                    }
                    else {
                        // API로 검색해서 첫 번째 결과 재생
                        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=1&key=${YOUTUBE_API_KEY}`;
                        const response = await (0, node_fetch_1.default)(searchUrl);
                        const data = await response.json();
                        if (data.items && data.items.length > 0) {
                            const firstVideo = data.items[0];
                            videoUrl = `https://www.youtube.com/watch?v=${firstVideo.id.videoId}`;
                            videoTitle = firstVideo.snippet.title;
                        }
                        else {
                            // 결과가 없으면 검색 페이지로
                            videoUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
                            videoTitle = `"${query}" 검색`;
                        }
                    }
                }
                else {
                    return {
                        success: false,
                        error: "검색어, 영상 ID, 또는 URL을 제공해주세요"
                    };
                }
                // 브라우저에서 열기
                const command = `start "" "${videoUrl}"`;
                const result = await executeCommand(command, 5000);
                return {
                    success: result.success,
                    url: videoUrl,
                    title: videoTitle,
                    message: result.success
                        ? `"${videoTitle}" 영상을 재생해드리겠습니다.`
                        : "영상을 열 수 없습니다",
                    error: result.error
                };
            }
            catch (error) {
                console.error("YouTube 재생 오류:", error);
                return {
                    success: false,
                    error: error.message || "YouTube 재생에 실패했습니다"
                };
            }
        }
    },
    // YouTube 인기 영상 조회
    youtube_trending: {
        schema: zod_1.z.object({
            regionCode: zod_1.z.string().optional().default('KR'),
            maxResults: zod_1.z.number().optional().default(10),
            category: zod_1.z.string().optional() // music, gaming, news 등
        }),
        async execute({ regionCode = 'KR', maxResults = 10, category }) {
            const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || process.env.GEMINI_API_KEY;
            if (!YOUTUBE_API_KEY) {
                return {
                    success: false,
                    error: "YouTube API 키가 설정되지 않았습니다"
                };
            }
            try {
                // 카테고리 ID 매핑
                const categoryMap = {
                    'music': '10',
                    '음악': '10',
                    'gaming': '20',
                    '게임': '20',
                    'news': '25',
                    '뉴스': '25',
                    'sports': '17',
                    '스포츠': '17',
                    'entertainment': '24',
                    '엔터테인먼트': '24',
                    'science': '28',
                    '과학기술': '28'
                };
                let apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=${regionCode}&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`;
                if (category && categoryMap[category.toLowerCase()]) {
                    apiUrl += `&videoCategoryId=${categoryMap[category.toLowerCase()]}`;
                }
                const response = await (0, node_fetch_1.default)(apiUrl);
                const data = await response.json();
                if (data.error) {
                    throw new Error(data.error.message);
                }
                const videos = (data.items || []).map((item, index) => ({
                    rank: index + 1,
                    videoId: item.id,
                    title: item.snippet?.title,
                    channel: item.snippet?.channelTitle,
                    views: parseInt(item.statistics?.viewCount || '0').toLocaleString(),
                    likes: parseInt(item.statistics?.likeCount || '0').toLocaleString(),
                    url: `https://www.youtube.com/watch?v=${item.id}`,
                    thumbnail: item.snippet?.thumbnails?.medium?.url
                }));
                return {
                    success: true,
                    region: regionCode,
                    category: category || '전체',
                    results: videos,
                    total: videos.length,
                    message: `${regionCode} 지역 인기 영상 ${videos.length}개`
                };
            }
            catch (error) {
                console.error("YouTube 인기 영상 조회 오류:", error);
                return {
                    success: false,
                    error: error.message || "인기 영상을 가져올 수 없습니다"
                };
            }
        }
    },
    // YouTube 채널 최신 영상 조회
    youtube_channel_videos: {
        schema: zod_1.z.object({
            channelName: zod_1.z.string().optional(),
            channelId: zod_1.z.string().optional(),
            maxResults: zod_1.z.number().optional().default(5)
        }),
        async execute({ channelName, channelId, maxResults = 5 }) {
            const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || process.env.GEMINI_API_KEY;
            if (!YOUTUBE_API_KEY) {
                return {
                    success: false,
                    error: "YouTube API 키가 설정되지 않았습니다"
                };
            }
            try {
                let targetChannelId = channelId;
                let targetChannelName = channelName;
                // 채널 이름으로 검색해서 채널 ID 찾기
                if (!targetChannelId && channelName) {
                    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(channelName)}&type=channel&maxResults=1&key=${YOUTUBE_API_KEY}`;
                    const searchResponse = await (0, node_fetch_1.default)(searchUrl);
                    const searchData = await searchResponse.json();
                    if (searchData.items && searchData.items.length > 0) {
                        targetChannelId = searchData.items[0].id.channelId;
                        targetChannelName = searchData.items[0].snippet.title;
                    }
                    else {
                        return {
                            success: false,
                            channelName,
                            error: `"${channelName}" 채널을 찾을 수 없습니다`
                        };
                    }
                }
                if (!targetChannelId) {
                    return {
                        success: false,
                        error: "채널 이름 또는 채널 ID를 제공해주세요"
                    };
                }
                // 채널의 업로드 플레이리스트 ID 가져오기
                const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&id=${targetChannelId}&key=${YOUTUBE_API_KEY}`;
                const channelResponse = await (0, node_fetch_1.default)(channelUrl);
                const channelData = await channelResponse.json();
                if (!channelData.items || channelData.items.length === 0) {
                    return {
                        success: false,
                        error: "채널 정보를 가져올 수 없습니다"
                    };
                }
                const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;
                const channelInfo = channelData.items[0].snippet;
                // 업로드 플레이리스트에서 최신 영상 가져오기
                const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`;
                const playlistResponse = await (0, node_fetch_1.default)(playlistUrl);
                const playlistData = await playlistResponse.json();
                const videos = (playlistData.items || []).map((item) => ({
                    videoId: item.snippet.resourceId.videoId,
                    title: item.snippet.title,
                    description: item.snippet.description?.substring(0, 100) + '...',
                    publishedAt: item.snippet.publishedAt,
                    thumbnail: item.snippet.thumbnails?.medium?.url,
                    url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
                }));
                return {
                    success: true,
                    channel: {
                        id: targetChannelId,
                        name: targetChannelName || channelInfo.title,
                        thumbnail: channelInfo.thumbnails?.default?.url
                    },
                    videos,
                    total: videos.length,
                    message: `"${targetChannelName || channelInfo.title}" 채널 최신 영상 ${videos.length}개`
                };
            }
            catch (error) {
                console.error("YouTube 채널 영상 조회 오류:", error);
                return {
                    success: false,
                    error: error.message || "채널 영상을 가져올 수 없습니다"
                };
            }
        }
    },
    // YouTube 영상 정보 조회
    youtube_video_info: {
        schema: zod_1.z.object({
            videoId: zod_1.z.string()
        }),
        async execute({ videoId }) {
            const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || process.env.GEMINI_API_KEY;
            if (!YOUTUBE_API_KEY) {
                return {
                    success: false,
                    error: "YouTube API 키가 설정되지 않았습니다"
                };
            }
            try {
                const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;
                const response = await (0, node_fetch_1.default)(apiUrl);
                const data = await response.json();
                if (!data.items || data.items.length === 0) {
                    return {
                        success: false,
                        error: "영상을 찾을 수 없습니다"
                    };
                }
                const video = data.items[0];
                const duration = video.contentDetails?.duration || '';
                // ISO 8601 duration을 읽기 쉬운 형식으로 변환
                const durationMatch = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
                let durationText = '';
                if (durationMatch) {
                    const hours = durationMatch[1] ? `${durationMatch[1]}시간 ` : '';
                    const minutes = durationMatch[2] ? `${durationMatch[2]}분 ` : '';
                    const seconds = durationMatch[3] ? `${durationMatch[3]}초` : '';
                    durationText = `${hours}${minutes}${seconds}`.trim();
                }
                return {
                    success: true,
                    video: {
                        videoId: video.id,
                        title: video.snippet?.title,
                        channel: video.snippet?.channelTitle,
                        channelId: video.snippet?.channelId,
                        description: video.snippet?.description,
                        publishedAt: video.snippet?.publishedAt,
                        duration: durationText,
                        views: parseInt(video.statistics?.viewCount || '0').toLocaleString(),
                        likes: parseInt(video.statistics?.likeCount || '0').toLocaleString(),
                        comments: parseInt(video.statistics?.commentCount || '0').toLocaleString(),
                        thumbnail: video.snippet?.thumbnails?.high?.url,
                        url: `https://www.youtube.com/watch?v=${video.id}`,
                        tags: video.snippet?.tags?.slice(0, 10) || []
                    }
                };
            }
            catch (error) {
                console.error("YouTube 영상 정보 조회 오류:", error);
                return {
                    success: false,
                    error: error.message || "영상 정보를 가져올 수 없습니다"
                };
            }
        }
    },
    // 프로그램 실행 (Windows 전체 검색)
    launch_program: {
        schema: zod_1.z.object({
            programName: zod_1.z.string() // 프로그램 이름
        }),
        async execute({ programName }) {
            try {
                console.log(`프로그램 검색 시작: "${programName}" (플랫폼: ${process.platform})`);
                // 🖥️ macOS 처리
                if (isMac) {
                    return await launchProgramMac(programName);
                }
                // 🖥️ Linux 처리  
                if (isLinux) {
                    return await launchProgramLinux(programName);
                }
                // Windows 처리 (기존 로직)
                // 별명 매핑 테이블
                const PROGRAM_NAME_ALIASES = {
                    // 한국어 줄임말 -> 실제 프로그램 이름 후보들
                    '카톡': ['카카오톡', 'kakaotalk'],
                    '카카오톡': ['kakaotalk', '카카오톡'],
                    '디코': ['discord', '디스코드'],
                    '디스코드': ['discord'],
                    '크롬': ['google chrome', 'chrome', '구글 크롬'],
                    '엣지': ['microsoft edge', 'edge'],
                    '파폭': ['firefox', 'mozilla firefox'],
                    '브라우저': ['chrome', 'edge', 'firefox'],
                    '스팀': ['steam'],
                    '리겜': ['league of legends', 'riot client'],
                    '롤': ['league of legends', 'riot client'],
                    '포토샵': ['photoshop', 'adobe photoshop'],
                    '일러': ['illustrator', 'adobe illustrator'],
                    '프리미어': ['premiere', 'adobe premiere'],
                    '엑셀': ['excel', 'microsoft excel'],
                    '워드': ['word', 'microsoft word'],
                    '파워포인트': ['powerpoint', 'microsoft powerpoint'],
                    '비주얼': ['visual studio', 'visual studio code'],
                    'vs코드': ['visual studio code', 'code'],
                    '계산기': ['calculator', 'calc'],
                    '메모장': ['notepad'],
                    '그림판': ['paint', 'mspaint']
                };
                const programNameLower = programName.toLowerCase().trim();
                const normalized = programNameLower.replace(/\s+/g, '');
                // 1) alias 후보 만들기
                const aliasCandidates = PROGRAM_NAME_ALIASES[programName]
                    || PROGRAM_NAME_ALIASES[programNameLower]
                    || PROGRAM_NAME_ALIASES[normalized]
                    || [];
                // 2) 최종 검색 후보 리스트 (원래 입력 + alias들)
                const searchNames = [
                    programNameLower,
                    normalized,
                    ...aliasCandidates.map(a => a.toLowerCase())
                ];
                console.log(`검색 후보: [${searchNames.join(', ')}]`);
                const foundPrograms = [];
                // 매칭 함수 (내부 함수들이 접근할 수 있도록 execute 함수 스코프에 정의)
                const matchesAnyName = (target, candidates) => {
                    const t = target.toLowerCase().replace(/\s+/g, '');
                    return candidates.some(c => {
                        const cNorm = c.toLowerCase().replace(/\s+/g, '');
                        return t === cNorm || t.includes(cNorm) || cNorm.includes(t);
                    });
                };
                // 시작 메뉴에서 재귀적으로 검색하는 함수
                const searchInDirectory = async (dirPath, searchNames, results, isStartMenu = false, depth = 0) => {
                    if (depth > 5)
                        return; // 최대 깊이 제한
                    try {
                        const entries = await promises_1.default.readdir(dirPath, { withFileTypes: true });
                        for (const entry of entries) {
                            const fullPath = path_1.default.join(dirPath, entry.name);
                            try {
                                if (entry.isDirectory()) {
                                    // 하위 디렉토리 검색
                                    await searchInDirectory(fullPath, searchNames, results, isStartMenu, depth + 1);
                                }
                                else if (entry.isFile()) {
                                    // .lnk 파일 또는 .exe 파일 검색
                                    const nameLower = entry.name.toLowerCase();
                                    if (nameLower.endsWith('.lnk') || nameLower.endsWith('.exe')) {
                                        const nameWithoutExt = entry.name.replace(/\.(lnk|exe)$/i, '');
                                        // 이름 매칭 (여러 검색 후보에 대해)
                                        if (matchesAnyName(nameWithoutExt, searchNames)) {
                                            results.push({
                                                name: nameWithoutExt,
                                                path: fullPath,
                                                type: entry.name.endsWith('.lnk') ? 'shortcut' : 'executable'
                                            });
                                        }
                                    }
                                }
                            }
                            catch {
                                // 개별 파일/폴더 접근 실패 시 무시하고 계속
                                continue;
                            }
                        }
                    }
                    catch {
                        // 디렉토리 읽기 실패 시 무시
                    }
                };
                // Program Files에서 .exe 파일 검색
                const searchExeFiles = async (dirPath, searchNames, results, depth = 0) => {
                    if (depth > 3)
                        return; // Program Files는 깊이 제한
                    try {
                        const entries = await promises_1.default.readdir(dirPath, { withFileTypes: true });
                        for (const entry of entries) {
                            const fullPath = path_1.default.join(dirPath, entry.name);
                            try {
                                if (entry.isDirectory()) {
                                    // 특정 폴더만 검색 (너무 깊이 들어가지 않도록)
                                    if (depth < 2) {
                                        await searchExeFiles(fullPath, searchNames, results, depth + 1);
                                    }
                                }
                                else if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
                                    const nameWithoutExt = entry.name.replace(/\.exe$/i, '');
                                    // 이름 매칭 (여러 검색 후보에 대해)
                                    if (matchesAnyName(nameWithoutExt, searchNames)) {
                                        results.push({
                                            name: nameWithoutExt,
                                            path: fullPath,
                                            type: 'executable'
                                        });
                                    }
                                }
                            }
                            catch {
                                continue;
                            }
                        }
                    }
                    catch {
                        // 디렉토리 읽기 실패 시 무시
                    }
                };
                // 레지스트리에서 설치된 프로그램 검색
                const searchRegistryPrograms = async (searchNames) => {
                    const results = [];
                    try {
                        // 레지스트리 쿼리 명령어 실행
                        const registryKeys = [
                            'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
                            'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
                        ];
                        for (const key of registryKeys) {
                            try {
                                // reg query 명령으로 레지스트리 읽기
                                const command = `reg query "${key}" /s /v DisplayName`;
                                const { stdout } = await execAsync(command, { timeout: 5000 });
                                // 출력 파싱
                                const lines = stdout.split('\n');
                                let currentKey = '';
                                for (const line of lines) {
                                    const trimmed = line.trim();
                                    if (trimmed.startsWith(key)) {
                                        currentKey = trimmed;
                                    }
                                    else if (trimmed.startsWith('DisplayName') && currentKey) {
                                        const match = trimmed.match(/DisplayName\s+REG_SZ\s+(.+)/);
                                        if (match) {
                                            const displayName = match[1].trim();
                                            // 이름 매칭 (여러 검색 후보에 대해)
                                            if (matchesAnyName(displayName, searchNames)) {
                                                // InstallLocation 찾기
                                                try {
                                                    const installCommand = `reg query "${currentKey}" /v InstallLocation`;
                                                    const { stdout: installStdout } = await execAsync(installCommand, { timeout: 2000 });
                                                    const installMatch = installStdout.match(/InstallLocation\s+REG_SZ\s+(.+)/);
                                                    if (installMatch) {
                                                        const installPath = installMatch[1].trim();
                                                        // InstallLocation에서 .exe 찾기
                                                        try {
                                                            const files = await promises_1.default.readdir(installPath);
                                                            const exeFile = files.find(f => f.toLowerCase().endsWith('.exe'));
                                                            if (exeFile) {
                                                                results.push({
                                                                    name: displayName,
                                                                    path: path_1.default.join(installPath, exeFile),
                                                                    type: 'executable'
                                                                });
                                                            }
                                                        }
                                                        catch {
                                                            // InstallLocation 접근 실패 시 무시
                                                        }
                                                    }
                                                }
                                                catch {
                                                    // InstallLocation 조회 실패 시 무시
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            catch {
                                // 레지스트리 키 접근 실패 시 무시
                                continue;
                            }
                        }
                    }
                    catch (error) {
                        console.log('레지스트리 검색 오류:', error);
                    }
                    return results;
                };
                // 1. 시작 메뉴 바로가기 검색 (가장 일반적)
                const startMenuPaths = [
                    path_1.default.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
                    path_1.default.join(process.env.PROGRAMDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
                    path_1.default.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
                ];
                for (const startMenuPath of startMenuPaths) {
                    try {
                        await promises_1.default.access(startMenuPath);
                        await searchInDirectory(startMenuPath, searchNames, foundPrograms, true);
                    }
                    catch {
                        // 경로 접근 실패 시 무시
                    }
                }
                // 2. Program Files에서 .exe 파일 검색
                const programFilesPaths = [
                    'C:\\Program Files',
                    'C:\\Program Files (x86)',
                    process.env.PROGRAMFILES || '',
                    process.env['ProgramFiles(x86)'] || ''
                ].filter(p => p);
                for (const programFilesPath of programFilesPaths) {
                    try {
                        await promises_1.default.access(programFilesPath);
                        await searchExeFiles(programFilesPath, searchNames, foundPrograms);
                    }
                    catch {
                        // 경로 접근 실패 시 무시
                    }
                }
                // 3. 레지스트리에서 설치된 프로그램 검색 (이름만, 실행 경로는 레지스트리에서 가져오기)
                try {
                    const registryPrograms = await searchRegistryPrograms(searchNames);
                    foundPrograms.push(...registryPrograms);
                }
                catch (error) {
                    console.log('레지스트리 검색 실패:', error);
                }
                console.log(`총 ${foundPrograms.length}개의 프로그램 발견`);
                if (foundPrograms.length > 0) {
                    console.log('발견된 프로그램 목록:');
                    foundPrograms.forEach((p, i) => {
                        console.log(`  ${i + 1}. ${p.name} (${p.path})`);
                    });
                }
                // 가장 일치하는 프로그램 찾기
                let bestMatch = null;
                // 정확한 일치 우선 (모든 검색 후보에 대해)
                for (const searchName of searchNames) {
                    for (const prog of foundPrograms) {
                        const progNameLower = prog.name.toLowerCase().replace(/\s+/g, '');
                        const searchNorm = searchName.toLowerCase().replace(/\s+/g, '');
                        if (progNameLower === searchNorm) {
                            bestMatch = prog;
                            console.log(`✓ 정확한 매칭: "${prog.name}" (${prog.path})`);
                            break;
                        }
                    }
                    if (bestMatch)
                        break;
                }
                // 정확한 일치가 없으면 포함 관계 확인
                if (!bestMatch) {
                    for (const searchName of searchNames) {
                        for (const prog of foundPrograms) {
                            const progNameLower = prog.name.toLowerCase().replace(/\s+/g, '');
                            const searchNorm = searchName.toLowerCase().replace(/\s+/g, '');
                            if (progNameLower.includes(searchNorm) || searchNorm.includes(progNameLower)) {
                                bestMatch = prog;
                                console.log(`✓ 포함 매칭: "${prog.name}" (${prog.path})`);
                                break;
                            }
                        }
                        if (bestMatch)
                            break;
                    }
                }
                if (!bestMatch && foundPrograms.length > 0) {
                    // 매칭 실패 시 첫 번째 결과 사용
                    bestMatch = foundPrograms[0];
                    console.log(`⚠ 매칭 실패, 첫 번째 결과 사용: "${bestMatch.name}" (${bestMatch.path})`);
                }
                if (bestMatch) {
                    console.log(`프로그램 실행 시도: ${bestMatch.path}`);
                    console.log(`프로그램 타입: ${bestMatch.type}, 이름: ${bestMatch.name}`);
                    try {
                        // Windows에서 프로그램 실행 - 가장 확실한 방법 사용
                        if (bestMatch.path.endsWith('.lnk')) {
                            // .lnk 파일은 cmd start로 실행
                            console.log('.lnk 파일 실행 시도');
                            const command = `cmd /c start "" "${bestMatch.path}"`;
                            console.log('실행 명령어:', command);
                            const child = (0, child_process_1.spawn)('cmd', ['/c', 'start', '""', bestMatch.path], {
                                shell: false,
                                detached: true,
                                stdio: 'ignore',
                                windowsVerbatimArguments: false
                            });
                            child.on('error', (err) => {
                                console.error('프로세스 실행 오류:', err);
                            });
                            child.unref();
                            // 짧은 대기 후 성공으로 간주
                            await new Promise(resolve => setTimeout(resolve, 500));
                            return {
                                success: true,
                                programName: bestMatch.name,
                                path: bestMatch.path,
                                message: `'${bestMatch.name}' 프로그램 실행 중...`
                            };
                        }
                        else {
                            // .exe 파일은 직접 spawn으로 실행
                            console.log('.exe 파일 직접 실행 시도');
                            console.log('실행 경로:', bestMatch.path);
                            const child = (0, child_process_1.spawn)(bestMatch.path, [], {
                                shell: false,
                                detached: true,
                                stdio: 'ignore'
                            });
                            child.on('error', (err) => {
                                console.error('프로세스 실행 오류:', err);
                            });
                            child.on('spawn', () => {
                                console.log('프로세스 spawn 성공');
                            });
                            child.unref();
                            // 짧은 대기 후 성공으로 간주
                            await new Promise(resolve => setTimeout(resolve, 500));
                            return {
                                success: true,
                                programName: bestMatch.name,
                                path: bestMatch.path,
                                message: `'${bestMatch.name}' 프로그램 실행 중...`
                            };
                        }
                    }
                    catch (execError) {
                        console.error('프로그램 실행 오류:', execError);
                        console.error('오류 스택:', execError.stack);
                        // 최종 폴백: execAsync 사용
                        try {
                            console.log('폴백: execAsync 사용');
                            const command = bestMatch.path.endsWith('.lnk')
                                ? `start "" "${bestMatch.path}"`
                                : `"${bestMatch.path}"`;
                            console.log('폴백 명령어:', command);
                            await execAsync(command, { timeout: 5000 });
                            return {
                                success: true,
                                programName: bestMatch.name,
                                path: bestMatch.path,
                                message: `'${bestMatch.name}' 프로그램 실행 중...`
                            };
                        }
                        catch (fallbackError) {
                            console.error('폴백 실행도 실패:', fallbackError);
                            return {
                                success: false,
                                programName: bestMatch.name,
                                path: bestMatch.path,
                                message: "프로그램 실행 실패",
                                error: fallbackError.message || execError.message,
                                details: {
                                    originalError: execError.message,
                                    fallbackError: fallbackError.message
                                }
                            };
                        }
                    }
                }
                // 프로그램을 찾지 못함
                return {
                    success: false,
                    programName,
                    message: `'${programName}' 프로그램을 찾을 수 없습니다.`,
                    note: "프로그램 이름을 정확히 입력하거나, 전체 경로를 알려주세요."
                };
            }
            catch (error) {
                console.error("프로그램 실행 오류:", error);
                return {
                    success: false,
                    error: `프로그램 실행 실패: ${error.message}`
                };
            }
        }
    }
};
//# sourceMappingURL=index.js.map