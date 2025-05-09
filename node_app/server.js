// 필요한 모듈을 가져옵니다.
const express = require("express");
const path = require("path");
const http = require('http'); // C++ API 서버 상태 확인용

const app = express();
const port = process.env.PORT || 3003; // 환경 변수 PORT 우선 사용

// 메모리 내 캐시 (서버 재시작 시 초기화됨)
let annotationsCache = {
    savedGlobalAnnotationsData: null,
    savedCalibrationResult: null,
};

// --- C++ API 서버 정보 설정 ---
let CPP_API_HOST_ENV = process.env.CPP_API_HOST;
let CPP_API_PORT_ENV = process.env.CPP_API_PORT;

let CPP_API_HOST;
let CPP_API_PORT;
let IS_CPP_API_CONFIGURED = false;

const DEFAULT_CPP_API_HOST = 'localhost'; // C++ API 호스트 기본값
const DEFAULT_CPP_API_PORT = 8080;      // C++ API 포트 기본값

if (CPP_API_HOST_ENV && CPP_API_PORT_ENV) {
    CPP_API_HOST = CPP_API_HOST_ENV;
    const parsedPort = parseInt(CPP_API_PORT_ENV, 10);
    if (!isNaN(parsedPort) && parsedPort > 0 && parsedPort < 65536) {
        CPP_API_PORT = parsedPort;
        IS_CPP_API_CONFIGURED = true;
        console.log(`[Server Startup] C++ API 서버가 다음으로 설정되었습니다: Host=${CPP_API_HOST}, Port=${CPP_API_PORT}`);
    } else {
        CPP_API_HOST = DEFAULT_CPP_API_HOST; // 유효하지 않은 포트면 기본값 사용
        CPP_API_PORT = DEFAULT_CPP_API_PORT;
        console.warn(`[Server Startup] 경고: CPP_API_PORT 환경 변수 ('${CPP_API_PORT_ENV}')가 유효한 포트 번호가 아닙니다. C++ API 연동이 기본값(Host=${CPP_API_HOST}, Port=${CPP_API_PORT})으로 시도되거나 비활성화됩니다.`);
        // IS_CPP_API_CONFIGURED는 false로 유지하거나, 기본값으로 시도하게 하려면 true로 설정할 수 있으나,
        // 명시적 설정이 없을 때의 문제를 방지하기 위해 false로 두는 것이 안전할 수 있습니다.
        // 여기서는 경고 후, 기본값으로 설정은 하지만 IS_CPP_API_CONFIGURED는 false로 두어 checkCppApiStatus에서 막도록 합니다.
        // 만약 기본값으로라도 시도하게 하려면 아래 주석을 해제하고 위의 IS_CPP_API_CONFIGURED = false를 제거
        // IS_CPP_API_CONFIGURED = true;
    }
} else {
    CPP_API_HOST = DEFAULT_CPP_API_HOST;
    CPP_API_PORT = DEFAULT_CPP_API_PORT;
    console.warn(`[Server Startup] 경고: CPP_API_HOST 또는 CPP_API_PORT 환경 변수가 설정되지 않았습니다. C++ API 연동 기능은 Host=${CPP_API_HOST}, Port=${CPP_API_PORT} (기본값)으로 시도되거나, 해당 주소에 서버가 없으면 비활성화된 것처럼 동작합니다.`);
    // 이 경우에도 IS_CPP_API_CONFIGURED = false로 두어, 명시적 설정 없이는 checkCppApiStatus에서 실제 호출을 막습니다.
    // 만약 기본값으로라도 시도하게 하려면 아래 주석을 해제
    // IS_CPP_API_CONFIGURED = true;
}
// 최종적으로, 환경 변수가 명확히 설정되고 유효할 때만 IS_CPP_API_CONFIGURED를 true로 합니다.
if (process.env.CPP_API_HOST && process.env.CPP_API_PORT) {
     const parsedPortCheck = parseInt(process.env.CPP_API_PORT, 10);
     if (!isNaN(parsedPortCheck) && parsedPortCheck > 0 && parsedPortCheck < 65536) {
        IS_CPP_API_CONFIGURED = true;
        CPP_API_HOST = process.env.CPP_API_HOST; // 확실하게 환경변수 값 사용
        CPP_API_PORT = parsedPortCheck;
        console.log(`[Server Startup] C++ API 환경변수 감지: Host=${CPP_API_HOST}, Port=${CPP_API_PORT}. 연동 활성화됨.`);
     } else {
        IS_CPP_API_CONFIGURED = false;
        console.warn(`[Server Startup] C++ API 환경변수는 있으나 포트(${process.env.CPP_API_PORT})가 유효하지 않아 연동 비활성화됨.`);
     }
} else {
    IS_CPP_API_CONFIGURED = false;
    console.warn(`[Server Startup] C++ API 환경변수 (CPP_API_HOST, CPP_API_PORT)가 설정되지 않아 연동 비활성화됨. 기본값 (${DEFAULT_CPP_API_HOST}:${DEFAULT_CPP_API_PORT}) 정보만 로깅됨.`);
    CPP_API_HOST = DEFAULT_CPP_API_HOST; // 로그 및 내부 참조용 기본값
    CPP_API_PORT = DEFAULT_CPP_API_PORT;
}


const CPP_API_HEALTH_ENDPOINT = process.env.CPP_API_HEALTH_ENDPOINT || '/health';
const CPP_API_HOMOGRAPHY_ENDPOINT = process.env.CPP_API_HOMOGRAPHY_ENDPOINT || '/calculate-homography';


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
    Object.keys(annotationsCache).forEach(key => {
        if (key !== 'savedGlobalAnnotationsData' && key !== 'savedCalibrationResult') {
            delete annotationsCache[key];
        }
    });
    console.log(
        "[Server] 모든 주석, 완료 상태, 저장된 전체 JSON 및 캘리브레이션 데이터가 초기화되었습니다."
    );
    res.status(200).json({ message: "모든 서버 데이터가 초기화되었습니다." });
});


// --- Homography 연산 관련 API ---
// C++ API 서버 상태 확인 함수
function checkCppApiStatus() {
    if (!IS_CPP_API_CONFIGURED) {
        // IS_CPP_API_CONFIGURED가 false이면 C++ API가 구성되지 않았거나 환경 변수 설정에 문제가 있는 것이므로,
        // 네트워크 요청을 시도하지 않고 즉시 '오프라인'으로 간주합니다.
        console.log("[checkCppApiStatus] C++ API가 구성되지 않았거나 환경 변수 설정이 올바르지 않아 상태 확인을 생략합니다.");
        return Promise.resolve(false);
    }

    return new Promise((resolve) => {
        const options = {
            host: CPP_API_HOST, // IS_CPP_API_CONFIGURED가 true일 때만 유효한 값으로 간주
            port: CPP_API_PORT, // IS_CPP_API_CONFIGURED가 true일 때만 유효한 값으로 간주
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

// Homography 페이지 상태 확인 API
app.get("/api/homography/status", async (req, res) => {
    // IS_CPP_API_CONFIGURED 가 false이면 cppApiOnline도 false가 되어야 함.
    // checkCppApiStatus 내부에서 IS_CPP_API_CONFIGURED를 이미 확인하므로, 여기서의 호출은 안전.
    const cppApiOnline = await checkCppApiStatus();
    res.json({
        hasGlobalAnnotations: !!annotationsCache.savedGlobalAnnotationsData,
        hasCalibrationResult: !!annotationsCache.savedCalibrationResult,
        isCppApiOnline: cppApiOnline, // IS_CPP_API_CONFIGURED가 false면 이 값은 false가 됨
        isCppApiConfigured: IS_CPP_API_CONFIGURED // 클라이언트에게 C++ API 설정 여부도 전달
    });
});

// Homography 연산 요청 API
app.post("/api/homography/calculate", async (req, res) => {
    if (!IS_CPP_API_CONFIGURED) {
        return res.status(503).json({ message: "C++ API 서버가 구성되지 않았습니다. 환경 변수를 확인해주세요." });
    }

    const requestData = req.body;
    if (!requestData || !requestData.calibration_config || !requestData.survey_data || !Array.isArray(requestData.survey_data.data)) {
        return res.status(400).json({ message: "잘못된 요청 데이터 형식입니다." });
    }
    if (requestData.survey_data.data.length < 4) {
        return res.status(400).json({ message: "Homography 연산을 위해서는 최소 4개의 포인트 쌍이 필요합니다." });
    }

    const cppApiOnline = await checkCppApiStatus();
    if (!cppApiOnline) {
        return res.status(503).json({ message: "C++ API 서버에 연결할 수 없습니다. 서버 상태를 확인하거나 나중에 다시 시도해주세요." });
    }

    try {
        const options = {
            host: CPP_API_HOST,
            port: CPP_API_PORT,
            path: CPP_API_HOMOGRAPHY_ENDPOINT,
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
                        console.log("[Server] Homography 연산 성공:", result);
                        res.status(200).json(result);
                    } else {
                        console.error("[Server] Homography 연산 C++ API 오류:", result);
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

        cppRequest.write(JSON.stringify(requestData));
        cppRequest.end();

    } catch (error) {
        console.error("[Server] Homography 연산 요청 중 예외 발생:", error);
        res.status(500).json({ message: "Homography 연산 처리 중 서버 내부 오류 발생", error: error.message });
    }
});


app.listen(port, () => {
    console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
    if (!IS_CPP_API_CONFIGURED) {
        console.warn(`[Server Startup] C++ API 연동이 비활성화 상태입니다. Homography 연산 기능 사용 불가. (환경 변수 CPP_API_HOST, CPP_API_PORT 확인 필요)`);
    }
});
