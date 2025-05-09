// 필요한 모듈을 가져옵니다.
const express = require("express");
const path = require("path");
const http = require('http'); // C++ API 서버 상태 확인용
const { URL } = require('url'); // URL 파싱을 위해 추가

const app = express();
const port = process.env.PORT || 3003; // 환경 변수 PORT 우선 사용

// 메모리 내 캐시 (서버 재시작 시 초기화됨)
let annotationsCache = {
    savedGlobalAnnotationsData: null,
    savedCalibrationResult: null,
};

// --- C++ API 서버 정보 설정 ---
const DEFAULT_CPP_API_HOST = 'localhost';
const DEFAULT_CPP_API_PORT = 3004; // C++ API가 실제로 리슨하는 포트 (사용자 로그 기준)

let CPP_API_HOST;
let CPP_API_PORT;
let IS_CPP_API_CONFIGURED = false;

const cppApiUrlFromEnv = process.env.CPP_API_URL;

if (cppApiUrlFromEnv) {
    try {
        const url = new URL(cppApiUrlFromEnv);
        CPP_API_HOST = url.hostname;
        const parsedPort = parseInt(url.port, 10);
        if (url.protocol === 'http:' && CPP_API_HOST && !isNaN(parsedPort) && parsedPort > 0 && parsedPort < 65536) {
            CPP_API_PORT = parsedPort;
            IS_CPP_API_CONFIGURED = true;
            console.log(`[Server Startup] C++ API 서버 환경 변수 CPP_API_URL 사용: Host=${CPP_API_HOST}, Port=${CPP_API_PORT}`);
        } else {
            throw new Error(`CPP_API_URL ('${cppApiUrlFromEnv}')에서 유효한 호스트 또는 포트를 추출할 수 없습니다.`);
        }
    } catch (error) {
        console.warn(`[Server Startup] 경고: CPP_API_URL ('${cppApiUrlFromEnv}') 분석 중 오류: ${error.message}. CPP_API_HOST/PORT 변수 또는 기본값을 확인합니다.`);
    }
}

if (!IS_CPP_API_CONFIGURED) {
    const hostFromEnv = process.env.CPP_API_HOST;
    const portStrFromEnv = process.env.CPP_API_PORT;

    if (hostFromEnv && portStrFromEnv) {
        const parsedPort = parseInt(portStrFromEnv, 10);
        if (!isNaN(parsedPort) && parsedPort > 0 && parsedPort < 65536) {
            CPP_API_HOST = hostFromEnv;
            CPP_API_PORT = parsedPort;
            IS_CPP_API_CONFIGURED = true;
            console.log(`[Server Startup] C++ API 서버 환경 변수 CPP_API_HOST/PORT 사용: Host=${CPP_API_HOST}, Port=${CPP_API_PORT}`);
        } else {
            console.warn(`[Server Startup] 경고: CPP_API_HOST/PORT 환경 변수는 있으나 포트 ('${portStrFromEnv}')가 유효하지 않습니다. 기본값을 사용합니다.`);
            CPP_API_HOST = DEFAULT_CPP_API_HOST;
            CPP_API_PORT = DEFAULT_CPP_API_PORT;
            IS_CPP_API_CONFIGURED = true;
        }
    } else {
        console.log(`[Server Startup] C++ API 서버 관련 환경 변수(CPP_API_URL, CPP_API_HOST/PORT) 없음. 기본값 사용: Host=${DEFAULT_CPP_API_HOST}, Port=${DEFAULT_CPP_API_PORT}`);
        CPP_API_HOST = DEFAULT_CPP_API_HOST;
        CPP_API_PORT = DEFAULT_CPP_API_PORT;
        IS_CPP_API_CONFIGURED = true;
    }
}

const CPP_API_HEALTH_ENDPOINT = process.env.CPP_API_HEALTH_ENDPOINT || '/health';
// C++ API의 실제 Homography 연산 경로로 수정
const CPP_API_HOMOGRAPHY_ENDPOINT = process.env.CPP_API_HOMOGRAPHY_ENDPOINT || '/api/homography/calculate_dynamic';


app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "index.html"));
});

// --- 이미지별 주석 관련 API ---
app.get("/api/images/:imageIdentifier/defined-points", (req, res) => {
    const imageIdentifier = decodeURIComponent(req.params.imageIdentifier);
    if (
        annotationsCache[imageIdentifier] &&
        annotationsCache[imageIdentifier].defined_points
    ) {
        res.json(annotationsCache[imageIdentifier].defined_points);
    } else {
        res.json([]);
    }
});

app.post("/api/images/:imageIdentifier/defined-points", (req, res) => {
    const imageIdentifier = decodeURIComponent(req.params.imageIdentifier);
    const newPoint = req.body;
    if (
        !newPoint ||
        typeof newPoint.id !== "string" ||
        !newPoint.camera_points ||
        !newPoint.ground_points
    ) {
        return res.status(400).json({
            message:
                "잘못된 포인트 데이터입니다. id, camera_points, ground_points가 필요합니다.",
        });
    }
    if (!annotationsCache[imageIdentifier]) {
        annotationsCache[imageIdentifier] = {
            completed: false,
            defined_points: [],
        };
    }
    if (
        annotationsCache[imageIdentifier].defined_points.some(
            (p) => p.id === newPoint.id
        )
    ) {
        return res.status(409).json({
            message: `포인트 ID '${newPoint.id}'가 이미 '${imageIdentifier}' 이미지에 존재합니다.`,
        });
    }
    const pointToStore = {
        ...newPoint,
        isGloballySaved: newPoint.isGloballySaved || false,
    };
    annotationsCache[imageIdentifier].defined_points.push(pointToStore);
    console.log(
        `[Server] 포인트 추가됨 (${imageIdentifier}, ID: ${pointToStore.id})`
    );
    res.status(201).json(pointToStore);
});

app.put("/api/images/:imageIdentifier/defined-points/:pointId", (req, res) => {
    const imageIdentifier = decodeURIComponent(req.params.imageIdentifier);
    const pointId = req.params.pointId;
    const updatedPointData = req.body;
    if (
        !annotationsCache[imageIdentifier] ||
        !annotationsCache[imageIdentifier].defined_points
    ) {
        return res.status(404).json({
            message: `이미지 '${imageIdentifier}'를 찾을 수 없거나 정의된 포인트가 없습니다.`,
        });
    }
    const pointIndex = annotationsCache[
        imageIdentifier
    ].defined_points.findIndex((p) => p.id === pointId);
    if (pointIndex === -1) {
        return res.status(404).json({
            message: `이미지 '${imageIdentifier}'에서 포인트 ID '${pointId}'를 찾을 수 없습니다.`,
        });
    }
    const currentIsGloballySaved =
        annotationsCache[imageIdentifier].defined_points[pointIndex]
            .isGloballySaved;
    annotationsCache[imageIdentifier].defined_points[pointIndex] = {
        ...annotationsCache[imageIdentifier].defined_points[pointIndex],
        camera_points:
            updatedPointData.camera_points ||
            annotationsCache[imageIdentifier].defined_points[pointIndex]
                .camera_points,
        ground_points:
            updatedPointData.ground_points ||
            annotationsCache[imageIdentifier].defined_points[pointIndex]
                .ground_points,
        isGloballySaved: currentIsGloballySaved,
    };
    console.log(`[Server] 포인트 수정됨 (${imageIdentifier}, ID: ${pointId})`);
    res.status(200).json(
        annotationsCache[imageIdentifier].defined_points[pointIndex]
    );
});

app.delete(
    "/api/images/:imageIdentifier/defined-points/:pointId",
    (req, res) => {
        const imageIdentifier = decodeURIComponent(req.params.imageIdentifier);
        const pointId = req.params.pointId;
        if (
            !annotationsCache[imageIdentifier] ||
            !annotationsCache[imageIdentifier].defined_points
        ) {
            return res.status(404).json({
                message: `이미지 '${imageIdentifier}'를 찾을 수 없거나 정의된 포인트가 없습니다.`,
            });
        }
        const initialLength =
            annotationsCache[imageIdentifier].defined_points.length;
        annotationsCache[imageIdentifier].defined_points = annotationsCache[
            imageIdentifier
        ].defined_points.filter((p) => p.id !== pointId);
        if (
            annotationsCache[imageIdentifier].defined_points.length ===
            initialLength
        ) {
            return res.status(404).json({
                message: `이미지 '${imageIdentifier}'에서 포인트 ID '${pointId}'를 찾을 수 없습니다.`,
            });
        }
        console.log(
            `[Server] 포인트 삭제됨 (${imageIdentifier}, ID: ${pointId})`
        );
        res.status(204).send();
    }
);

app.put(
    "/api/images/:imageIdentifier/defined-points/:pointId/global-status",
    (req, res) => {
        const imageIdentifier = decodeURIComponent(req.params.imageIdentifier);
        const pointId = req.params.pointId;
        const { isGloballySaved } = req.body;
        if (typeof isGloballySaved !== "boolean") {
            return res
                .status(400)
                .json({
                    message: "isGloballySaved (boolean) 값이 필요합니다.",
                });
        }
        if (
            !annotationsCache[imageIdentifier] ||
            !annotationsCache[imageIdentifier].defined_points
        ) {
            return res.status(404).json({
                message: `이미지 '${imageIdentifier}'를 찾을 수 없거나 정의된 포인트가 없습니다.`,
            });
        }
        const pointIndex = annotationsCache[
            imageIdentifier
        ].defined_points.findIndex((p) => p.id === pointId);
        if (pointIndex === -1) {
            return res.status(404).json({
                message: `이미지 '${imageIdentifier}'에서 포인트 ID '${pointId}'를 찾을 수 없습니다.`,
            });
        }
        annotationsCache[imageIdentifier].defined_points[
            pointIndex
        ].isGloballySaved = isGloballySaved;
        console.log(
            `[Server] 포인트 Global 상태 변경 (${imageIdentifier}, ID: ${pointId}): ${isGloballySaved}`
        );
        res.status(200).json(
            annotationsCache[imageIdentifier].defined_points[pointIndex]
        );
    }
);

app.post("/api/images/:imageIdentifier/complete", (req, res) => {
    const imageIdentifier = decodeURIComponent(req.params.imageIdentifier);
    if (!annotationsCache[imageIdentifier]) {
        annotationsCache[imageIdentifier] = {
            completed: false,
            defined_points: [],
        };
    }
    annotationsCache[imageIdentifier].completed = true;
    console.log(`[Server] 이미지 완료 처리됨 (${imageIdentifier})`);
    res.status(200).json({ message: "이미지가 완료 상태로 변경되었습니다." });
});

app.get("/api/images/:imageIdentifier/status", (req, res) => {
    const imageIdentifier = decodeURIComponent(req.params.imageIdentifier);
    if (annotationsCache[imageIdentifier]) {
        res.json({ completed: annotationsCache[imageIdentifier].completed });
    } else {
        res.json({ completed: false });
    }
});

// --- 전체 JSON 데이터 및 캘리브레이션 결과 저장/로드 API ---
app.post("/api/global-annotations/save", (req, res) => {
    const dataToSave = req.body;
    if (!dataToSave || typeof dataToSave.data === "undefined") {
        return res.status(400).json({
            message:
                '잘못된 데이터 형식입니다. {"data": [...]} 구조여야 합니다.',
        });
    }
    annotationsCache.savedGlobalAnnotationsData = dataToSave;
    console.log("[Server] 전체 JSON 데이터가 서버에 저장(캐시)되었습니다.");
    res.status(200).json({
        message: "전체 JSON 데이터가 성공적으로 저장되었습니다.",
    });
});

app.get("/api/global-annotations", (req, res) => {
    if (annotationsCache.savedGlobalAnnotationsData) {
        res.json(annotationsCache.savedGlobalAnnotationsData);
    } else {
        res.json({ data: [] });
    }
});

app.post("/api/calibration-result/save", (req, res) => {
    const calibrationData = req.body;
    if (
        !calibrationData ||
        typeof calibrationData.CalibrationInfo === "undefined"
    ) {
        return res
            .status(400)
            .json({ message: "잘못된 캘리브레이션 데이터 형식입니다." });
    }
    annotationsCache.savedCalibrationResult = calibrationData;
    console.log("[Server] 캘리브레이션 결과가 서버에 저장(캐시)되었습니다.");
    res.status(200).json({
        message: "캘리브레이션 결과가 성공적으로 저장되었습니다.",
    });
});

app.get("/api/calibration-result", (req, res) => {
    if (annotationsCache.savedCalibrationResult) {
        res.json(annotationsCache.savedCalibrationResult);
    } else {
        res.status(404).json({
            message: "저장된 캘리브레이션 결과가 없습니다.",
        });
    }
});

// --- 전체 데이터 초기화 API ---
app.delete("/api/all-data", (req, res) => {
    annotationsCache = {
        savedGlobalAnnotationsData: null,
        savedCalibrationResult: null,
    };
    console.log(
        "[Server] 모든 주석, 완료 상태, 저장된 전체 JSON 및 캘리브레이션 데이터가 초기화되었습니다."
    );
    res.status(200).json({ message: "모든 서버 데이터가 초기화되었습니다." });
});


// --- Homography 연산 관련 API ---
function checkCppApiStatus() {
    if (!IS_CPP_API_CONFIGURED) {
        console.warn("[checkCppApiStatus] C++ API 접속 정보가 유효하게 설정되지 않았을 수 있습니다. (환경 변수 확인). 상태 확인을 시도합니다.");
    }

    return new Promise((resolve) => {
        if (!CPP_API_HOST || !CPP_API_PORT) {
            console.error("[checkCppApiStatus] C++ API 호스트 또는 포트가 정의되지 않았습니다.");
            return resolve(false);
        }
        const options = {
            host: CPP_API_HOST,
            port: CPP_API_PORT,
            path: CPP_API_HEALTH_ENDPOINT,
            method: 'GET',
            timeout: 2000,
        };
        const req = http.request(options, (res) => {
            resolve(res.statusCode === 200);
        });
        req.on('error', (err) => {
            console.error(`[Server] C++ API 서버 (${CPP_API_HOST}:${CPP_API_PORT}${CPP_API_HEALTH_ENDPOINT}) 연결 오류:`, err.message);
            resolve(false);
        });
        req.on('timeout', () => {
            console.error(`[Server] C++ API 서버 (${CPP_API_HOST}:${CPP_API_PORT}${CPP_API_HEALTH_ENDPOINT}) 연결 시간 초과.`);
            req.abort();
            resolve(false);
        });
        req.end();
    });
}

app.get("/api/homography/status", async (req, res) => {
    const cppApiOnline = await checkCppApiStatus();
    res.json({
        hasGlobalAnnotations: !!annotationsCache.savedGlobalAnnotationsData,
        hasCalibrationResult: !!annotationsCache.savedCalibrationResult,
        isCppApiOnline: cppApiOnline,
        isCppApiConfigured: IS_CPP_API_CONFIGURED
    });
});

// Homography 연산 요청 API (서버 캐시 데이터 사용)
app.post("/api/homography/calculate", async (req, res) => {
    if (!IS_CPP_API_CONFIGURED) {
        return res.status(503).json({ message: "C++ API 서버가 올바르게 구성되지 않았습니다. 환경 변수를 확인해주세요." });
    }

    // 1. 서버 캐시에서 데이터 가져오기
    const calibrationData = annotationsCache.savedCalibrationResult;
    const globalAnnotations = annotationsCache.savedGlobalAnnotationsData;

    if (!calibrationData || typeof calibrationData.CalibrationInfo === "undefined") {
        return res.status(400).json({ message: "서버에 저장된 캘리브레이션 데이터가 유효하지 않습니다." });
    }
    if (!globalAnnotations || !Array.isArray(globalAnnotations.data) || globalAnnotations.data.length < 4) {
        return res.status(400).json({ message: "서버에 저장된 전체 주석 데이터가 유효하지 않거나, Homography 연산을 위한 포인트 쌍(최소 4개)이 부족합니다." });
    }

    // 2. C++ API가 요구하는 형식으로 페이로드 구성
    const surveyDataForCpp = globalAnnotations.data.map(point => ({
        camera_coords: point.camera_points, // C++ API는 'camera_coords'를 기대
        ground_coords: point.ground_points  // C++ API는 'ground_coords'를 기대
    }));

    const payloadToCpp = {
        calibration_config: calibrationData, // 전체 캘리브레이션 객체 전달 (내부에 CalibrationInfo 포함)
        survey_data: {
            data: surveyDataForCpp
        }
    };

    console.log("[Server /api/homography/calculate] C++ API 요청 페이로드:", JSON.stringify(payloadToCpp, null, 2));


    // 3. C++ API 서버 상태 확인 및 요청
    const cppApiOnline = await checkCppApiStatus();
    if (!cppApiOnline) {
        return res.status(503).json({ message: `C++ API 서버(${CPP_API_HOST}:${CPP_API_PORT})에 연결할 수 없습니다. 서버 상태를 확인하거나 나중에 다시 시도해주세요.` });
    }

    try {
        const options = {
            host: CPP_API_HOST,
            port: CPP_API_PORT,
            path: CPP_API_HOMOGRAPHY_ENDPOINT, // C++ API의 실제 Homography 연산 경로
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 10000,
        };

        const cppRequest = http.request(options, (cppRes) => {
            let responseBody = '';
            cppRes.setEncoding('utf8');
            cppRes.on('data', (chunk) => {
                responseBody += chunk;
            });
            cppRes.on('end', () => {
                try {
                    const result = JSON.parse(responseBody);
                    if (cppRes.statusCode === 200) {
                        console.log("[Server] Homography 연산 성공 (C++ API 응답):", result);
                        res.status(200).json(result);
                    } else {
                        console.error("[Server] Homography 연산 C++ API 오류 응답:", result);
                        res.status(cppRes.statusCode).json(result);
                    }
                } catch (parseError) {
                    console.error("[Server] Homography 연산 C++ API 응답 파싱 오류:", parseError, "응답 내용:", responseBody);
                    res.status(500).json({ message: "C++ API 응답 처리 중 오류 발생", error: parseError.message, rawResponse: responseBody });
                }
            });
        });

        cppRequest.on('error', (error) => {
            console.error(`[Server] C++ API (${CPP_API_HOST}:${CPP_API_PORT}${CPP_API_HOMOGRAPHY_ENDPOINT}) 요청 오류:`, error);
            res.status(500).json({ message: "C++ API 서버 요청 중 오류 발생", error: error.message });
        });

        cppRequest.on('timeout', () => {
            console.error(`[Server] C++ API (${CPP_API_HOST}:${CPP_API_PORT}${CPP_API_HOMOGRAPHY_ENDPOINT}) 요청 시간 초과.`);
            cppRequest.abort();
            res.status(504).json({ message: "C++ API 서버 요청 시간 초과" });
        });

        cppRequest.write(JSON.stringify(payloadToCpp));
        cppRequest.end();

    } catch (error) {
        console.error("[Server] Homography 연산 요청 중 예외 발생:", error);
        res.status(500).json({ message: "Homography 연산 처리 중 서버 내부 오류 발생", error: error.message });
    }
});


app.listen(port, () => {
    console.log(`Node.js 서버가 http://localhost:${port} 에서 실행 중입니다.`);
    if (IS_CPP_API_CONFIGURED && CPP_API_HOST && CPP_API_PORT) {
        console.log(`C++ API 서버 연동 설정: Host=${CPP_API_HOST}, Port=${CPP_API_PORT}, Health Endpoint=${CPP_API_HEALTH_ENDPOINT}, Homography Endpoint=${CPP_API_HOMOGRAPHY_ENDPOINT}`);
    } else {
        console.warn(`[Server Startup] C++ API 연동이 올바르게 구성되지 않았습니다. Homography 연산 기능이 작동하지 않을 수 있습니다. (환경 변수 CPP_API_URL 또는 CPP_API_HOST/PORT 확인 필요)`);
    }
});
