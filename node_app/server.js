const express = require("express");
const path = require("path");

const app = express();
const port = 3003;

// 메모리 내 캐시 (서버 재시작 시 초기화됨)
// annotationsCache[imageIdentifier] = {
//   completed: boolean,
//   defined_points: Array<PointObject>
// }
// PointObject = { id: string, camera_points: Array, ground_points: Array, isGloballySaved: boolean }
// 추가: 전체 주석 데이터 및 캘리브레이션 결과 캐시
let annotationsCache = {
	// imageIdentifier 키들은 여기에 동적으로 추가됨
	// 예: "MyFolder/image1.jpg": { completed: false, defined_points: [] }
	savedGlobalAnnotationsData: null, // 전체 JSON 데이터 저장용
	savedCalibrationResult: null, // 캘리브레이션 결과 JSON 저장용
};

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
		// 기본적인 data 필드 존재 유무 확인
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
		res.json({ data: [] }); // 저장된 데이터가 없으면 빈 데이터 구조 반환
	}
});

app.post("/api/calibration-result/save", (req, res) => {
	const calibrationData = req.body;
	if (
		!calibrationData ||
		typeof calibrationData.CalibrationInfo === "undefined"
	) {
		// 기본적인 CalibrationInfo 필드 존재 유무 확인
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
		// 이미지별 데이터는 유지하지 않고 전체 캐시를 초기화
		savedGlobalAnnotationsData: null,
		savedCalibrationResult: null,
	};
	console.log(
		"[Server] 모든 주석, 완료 상태, 저장된 전체 JSON 및 캘리브레이션 데이터가 초기화되었습니다."
	);
	res.status(200).json({ message: "모든 서버 데이터가 초기화되었습니다." });
});

app.listen(port, () => {
	console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});
