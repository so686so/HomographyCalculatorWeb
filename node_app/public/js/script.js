document.addEventListener("DOMContentLoaded", () => {
	// --- HTML 요소 가져오기 ---
	const folderPickerElement = document.getElementById("folderPicker");
	const customFolderButtonElement =
		document.getElementById("customFolderButton");
	const imageListElement = document.getElementById("imageList");
	const uploadedImageElement = document.getElementById("uploadedImage");
	const crosshairCanvasElement = document.getElementById("crosshairCanvas");
	const jsonResultCurrentElement =
		document.getElementById("jsonResultCurrent");
	const jsonResultGlobalElement = document.getElementById("jsonResultGlobal");
	const markCompleteBtnElement = document.getElementById("markCompleteBtn");
	const imageSelectionPromptElement = document.getElementById(
		"imageSelectionPrompt"
	);
	const definedPointsListElement =
		document.getElementById("definedPointsList");
	const resetGlobalJsonBtnElement =
		document.getElementById("resetGlobalJsonBtn");
	const importJsonFileElement = document.getElementById("importJsonFile");
	const importJsonBtnElement = document.getElementById("importJsonBtn");
	const exportJsonBtnElement = document.getElementById("exportJsonBtn");
	const saveGlobalJsonBtnElement =
		document.getElementById("saveGlobalJsonBtn");
	const crosshairTooltipElement = document.getElementById("crosshairTooltip");
	const crosshairActionMenuElement = document.getElementById(
		"crosshairActionMenu"
	);

	const groundTruthPopupElement = document.getElementById("groundTruthPopup");
	const closePopupBtnElement = document.getElementById("closePopupBtn");
	const popupTitleElement = document.getElementById("popupTitle");
	const popupCameraCoordsElement =
		document.getElementById("popupCameraCoords");
	const popupEditingPointIdElement =
		document.getElementById("editingPointId");
	const popupGroundXElement = document.getElementById("popupGroundX");
	const popupGroundYElement = document.getElementById("popupGroundY");
	const popupSubmitBtnElement = document.getElementById("popupSubmitBtn");
	const popupCancelBtnElement = document.getElementById("popupCancelBtn");

	const infoSelectedFolderElement =
		document.getElementById("infoSelectedFolder");
	const infoSelectedImageFileElement = document.getElementById(
		"infoSelectedImageFile"
	);
	const infoResolutionElement = document.getElementById("infoResolution");

	const statsTotalConfirmedElement = document.getElementById(
		"statsTotalConfirmed"
	);
	const statsCurrentImageTemporaryElement = document.getElementById(
		"statsCurrentImageTemporary"
	);
	const statsCurrentImageConfirmedElement = document.getElementById(
		"statsCurrentImageConfirmed"
	);

	const hamburgerMenuBtnElement = document.getElementById("hamburgerMenuBtn");
	const mainNavigationMenuElement =
		document.getElementById("mainNavigationMenu");

	const calibrationInputTextElement = document.getElementById(
		"calibrationInputText"
	);
	const convertToJsonBtnElement = document.getElementById("convertToJsonBtn");
	const resetCalibrationTextBtnElement = document.getElementById(
		"resetCalibrationTextBtn"
	);
	const calibrationOutputJsonElement = document.getElementById(
		"calibrationOutputJson"
	);
	const saveCalibrationResultBtnElement = document.getElementById(
		"saveCalibrationResultBtn"
	);

	const pageViews = document.querySelectorAll(".page-view");
	const pageContainerElement = document.getElementById("pageContainer");

	// Homography 페이지 요소
	const statusGlobalAnnotationsElement = document.getElementById(
		"statusGlobalAnnotations"
	);
	const statusCalibrationResultElement = document.getElementById(
		"statusCalibrationResult"
	);
	const statusCppApiServerElement =
		document.getElementById("statusCppApiServer");
	const refreshHomographyStatusBtnElement = document.getElementById(
		"refreshHomographyStatusBtn"
	);
	const requestHomographyBtnElement = document.getElementById(
		"requestHomographyBtn"
	);
	const homographyResultTextElement = document.getElementById(
		"homographyResultText"
	);
	const viewGlobalAnnotationsJsonBtnElement = document.getElementById(
		"viewGlobalAnnotationsJsonBtn"
	);
	const viewCalibrationResultJsonBtnElement = document.getElementById(
		"viewCalibrationResultJsonBtn"
	);
	const homographyCalcStatusIconElement = document.getElementById(
		"homographyCalcStatusIcon"
	);

	// JSON 보기 팝업 요소
	const jsonDisplayPopupElement = document.getElementById("jsonDisplayPopup");
	const closeJsonDisplayPopupBtnElement = document.getElementById(
		"closeJsonDisplayPopupBtn"
	);
	const jsonDisplayPopupTitleElement = document.getElementById(
		"jsonDisplayPopupTitle"
	);
	const jsonDisplayPopupContentElement = document.getElementById(
		"jsonDisplayPopupContent"
	);

	// 플로팅 전체 캐시 초기화 버튼 요소
	const floatingResetAllCacheBtnElement = document.getElementById(
		"floatingResetAllCacheBtn"
	);

	const ctx = crosshairCanvasElement.getContext("2d");

	// --- 상태 변수 ---
	let currentImageIdentifier = null;
	let currentSelectedFileObject = null;
	let currentClickedCameraX = null;
	let currentClickedCameraY = null;
	let imageNaturalWidth = 0;
	let imageNaturalHeight = 0;
	let globalJsonData = { data: [] };
	let clientCalibrationResult = null;
	let currentImageAnnotations = [];
	let currentImageDefinedPoints = [];
	let allFilesInFolder = [];
	let allCrosshairHotspots = [];
	let activeHotspotForMenu = null;

	// --- 유틸리티 함수 ---
	function generateUUID() {
		return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
			(
				c ^
				(crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
			).toString(16)
		);
	}

	// --- 뷰 전환 로직 ---
	function switchView(targetViewId) {
		console.log("[switchView] Switching to view:", targetViewId);
		pageViews.forEach((view) => {
			view.style.display = view.id === targetViewId ? "block" : "none";
			view.classList.toggle("current-view", view.id === targetViewId);
		});
		if (pageContainerElement) pageContainerElement.scrollTop = 0;
		document.body.classList.toggle(
			"utility-view-active",
			targetViewId === "viewJsonConversion" ||
				targetViewId === "viewHomographyCalc"
		);

		if (targetViewId === "viewHomographyCalc") {
			if (homographyResultTextElement) {
				homographyResultTextElement.textContent = "결과 대기 중...";
			}
			updateHomographyCalcStatusIcon("waiting");
			checkHomographyPrerequisites();
		}
	}

	// --- 상단 네비게이션 메뉴 토글 로직 ---
	if (hamburgerMenuBtnElement && mainNavigationMenuElement) {
		hamburgerMenuBtnElement.addEventListener("click", (event) => {
			event.stopPropagation();
			mainNavigationMenuElement.classList.toggle("open");
			mainNavigationMenuElement.classList.toggle(
				"visually-hidden",
				!mainNavigationMenuElement.classList.contains("open")
			);
		});
		document.addEventListener(
			"click",
			(event) => {
				if (
					mainNavigationMenuElement.classList.contains("open") &&
					!mainNavigationMenuElement.contains(event.target) &&
					event.target !== hamburgerMenuBtnElement
				) {
					mainNavigationMenuElement.classList.remove("open");
					mainNavigationMenuElement.classList.add("visually-hidden");
				}
				if (
					crosshairActionMenuElement.style.display === "flex" &&
					!crosshairActionMenuElement.contains(event.target) &&
					!(
						uploadedImageElement.contains(event.target) ||
						event.target === uploadedImageElement
					)
				) {
					closeCrosshairActionMenu();
				}
				// JSON 팝업 외부 클릭 시 닫기
				if (
					jsonDisplayPopupElement &&
					jsonDisplayPopupElement.style.display === "flex" &&
					event.target === jsonDisplayPopupElement
				) {
					closeJsonPopup();
				}
			},
			true
		);
		mainNavigationMenuElement
			.querySelectorAll(".menu-item")
			.forEach((item) => {
				item.addEventListener("click", (event) => {
					event.preventDefault();
					const pageId = event.target.dataset.page;
					mainNavigationMenuElement
						.querySelectorAll(".menu-item")
						.forEach((el) =>
							el.classList.remove("active-menu-item")
						);
					event.target.classList.add("active-menu-item");
					switchView(pageId);
					mainNavigationMenuElement.classList.remove("open");
					mainNavigationMenuElement.classList.add("visually-hidden");
				});
			});
	}

	// --- 폴더 선택 및 이미지 목록 로드 ---
	if (customFolderButtonElement) {
		customFolderButtonElement.addEventListener("click", () => {
			folderPickerElement.click();
		});
	}
	folderPickerElement.addEventListener("change", async (event) => {
		imageListElement.innerHTML = "<li>로딩 중...</li>";
		allFilesInFolder = Array.from(event.target.files);
		const imageFiles = allFilesInFolder.filter(
			(file) => file.type && file.type.startsWith("image/")
		);
		if (imageFiles.length === 0) {
			imageListElement.innerHTML =
				"<li>폴더에 이미지 파일이 없습니다.</li>";
			clearMainContentForNewFolder();
			return;
		}
		await renderImageList(imageFiles);
		clearMainContentForNewFolder();
		updateStatsHeader();
	});

	async function renderImageList(imageFilesToList = null) {
		const filesToRender =
			imageFilesToList ||
			allFilesInFolder.filter(
				(file) => file.type && file.type.startsWith("image/")
			);
		imageListElement.innerHTML = "";
		if (filesToRender.length === 0 && !imageFilesToList) {
			imageListElement.innerHTML =
				"<li>폴더에 이미지 파일이 없습니다.</li>";
		} else if (filesToRender.length > 0) {
			imageSelectionPromptElement.textContent =
				"사이드바 목록에서 이미지를 선택하세요.";
		}
		for (const file of filesToRender) {
			const listItem = document.createElement("li");
			const imageIdentifier = file.webkitRelativePath || file.name;
			listItem.textContent = file.name;
			listItem.dataset.imageName = imageIdentifier;
			try {
				const response = await fetch(
					`/api/images/${encodeURIComponent(imageIdentifier)}/status`
				);
				if (response.ok) {
					const status = await response.json();
					if (status.completed) listItem.classList.add("completed");
				} else {
					console.warn(
						`[${imageIdentifier}] 완료 상태 로드 실패: ${response.status}`
					);
				}
			} catch (e) {
				console.error(
					`[${imageIdentifier}] 완료 상태 로드 중 오류:`,
					e
				);
			}
			listItem.addEventListener("click", () => {
				selectImage(file);
				document
					.querySelectorAll("#imageList li")
					.forEach((li) => li.classList.remove("active-selection"));
				listItem.classList.add("active-selection");
			});
			imageListElement.appendChild(listItem);
		}
	}

	function clearMainContentForNewFolder() {
		uploadedImageElement.style.display = "none";
		uploadedImageElement.src = "#";
		if (infoSelectedFolderElement)
			infoSelectedFolderElement.textContent = "N/A";
		if (infoSelectedImageFileElement)
			infoSelectedImageFileElement.textContent = "N/A";
		if (infoResolutionElement) infoResolutionElement.textContent = "N/A";
		if (jsonResultCurrentElement)
			jsonResultCurrentElement.textContent = "{}";
		currentImageDefinedPoints = [];
		renderDefinedPointsList();
		currentImageAnnotations = [];
		if (ctx)
			ctx.clearRect(
				0,
				0,
				crosshairCanvasElement.width,
				crosshairCanvasElement.height
			);
		markCompleteBtnElement.style.display = "none";
		currentImageIdentifier = null;
		currentSelectedFileObject = null;
		closePopup();
		closeCrosshairActionMenu();
		if (
			jsonDisplayPopupElement &&
			jsonDisplayPopupElement.style.display === "flex"
		)
			closeJsonPopup();
		crosshairTooltipElement.style.display = "none";
		crosshairTooltipElement.classList.remove("visible");
		updateStatsHeader();
	}

	async function selectImage(fileObject) {
		currentSelectedFileObject = fileObject;
		currentImageIdentifier =
			fileObject.webkitRelativePath || fileObject.name;
		const pathParts = currentImageIdentifier.split("/");
		const fileName = pathParts.pop() || currentImageIdentifier;
		let folderName = pathParts.join("/");
		if (!folderName && currentImageIdentifier !== fileName) {
			const lastSlashIndex = currentImageIdentifier.lastIndexOf("/");
			if (
				lastSlashIndex > -1 &&
				lastSlashIndex < currentImageIdentifier.length - 1
			) {
				folderName = currentImageIdentifier.substring(
					0,
					lastSlashIndex
				);
			} else {
				folderName = "(루트)";
			}
		} else if (!folderName) {
			folderName = "(루트)";
		}
		if (infoSelectedFolderElement)
			infoSelectedFolderElement.textContent = folderName;
		if (infoSelectedImageFileElement)
			infoSelectedImageFileElement.textContent = fileName;
		if (infoResolutionElement)
			infoResolutionElement.textContent = "로딩 중...";
		markCompleteBtnElement.style.display = "block";
		imageSelectionPromptElement.style.display = "none";
		resetUIForNewImageSelection();
		closeCrosshairActionMenu();
		if (
			jsonDisplayPopupElement &&
			jsonDisplayPopupElement.style.display === "flex"
		)
			closeJsonPopup();

		try {
			console.log(
				`[selectImage] Fetching defined points for: ${currentImageIdentifier}`
			);
			const response = await fetch(
				`/api/images/${encodeURIComponent(
					currentImageIdentifier
				)}/defined-points`
			);
			currentImageDefinedPoints = !response.ok
				? (console.warn(
						`[${currentImageIdentifier}] 포인트 목록 로드 실패 (${response.status})`
				  ),
				  [])
				: await response.json();
			console.log(
				`[selectImage] Fetched ${
					currentImageDefinedPoints
						? currentImageDefinedPoints.length
						: 0
				} points for ${currentImageIdentifier}:`,
				JSON.parse(JSON.stringify(currentImageDefinedPoints))
			);
		} catch (error) {
			console.error(
				`[${currentImageIdentifier}] 포인트 목록 로드 중 예외:`,
				error
			);
			currentImageDefinedPoints = [];
		}
		renderDefinedPointsList();
		uploadedImageElement.onload = () => {
			imageNaturalWidth = uploadedImageElement.naturalWidth;
			imageNaturalHeight = uploadedImageElement.naturalHeight;
			if (infoResolutionElement)
				infoResolutionElement.textContent = `${imageNaturalWidth} x ${imageNaturalHeight}`;
			console.log(
				"[img.onload] Natural W/H:",
				imageNaturalWidth,
				imageNaturalHeight,
				"Offset W/H:",
				uploadedImageElement.offsetWidth,
				uploadedImageElement.offsetHeight
			);
			const setupCanvasAndDraw = () => {
				if (
					uploadedImageElement.offsetWidth > 0 &&
					uploadedImageElement.offsetHeight > 0
				) {
					crosshairCanvasElement.width =
						uploadedImageElement.offsetWidth;
					crosshairCanvasElement.height =
						uploadedImageElement.offsetHeight;
					console.log(
						"[setupCanvasAndDraw] Canvas size set to:",
						crosshairCanvasElement.width,
						crosshairCanvasElement.height
					);
					deriveAndDrawAnnotations();
				} else {
					console.warn(
						"[setupCanvasAndDraw] Image offsetWidth/Height is 0. Annotations might not be drawn correctly."
					);
					if (ctx)
						ctx.clearRect(
							0,
							0,
							crosshairCanvasElement.width,
							crosshairCanvasElement.height
						);
					allCrosshairHotspots = [];
				}
			};
			requestAnimationFrame(() => {
				requestAnimationFrame(setupCanvasAndDraw);
			});
		};
		uploadedImageElement.onerror = () => {
			console.error("이미지 src 로드 실패:", uploadedImageElement.src);
			if (infoResolutionElement)
				infoResolutionElement.textContent = "로드 실패";
			if (infoSelectedImageFileElement)
				infoSelectedImageFileElement.textContent = "N/A";
			if (infoSelectedFolderElement)
				infoSelectedFolderElement.textContent = "N/A";
			uploadedImageElement.style.display = "none";
			markCompleteBtnElement.style.display = "none";
			currentImageAnnotations = [];
			currentImageDefinedPoints = [];
			renderDefinedPointsList();
			if (ctx)
				ctx.clearRect(
					0,
					0,
					crosshairCanvasElement.width,
					crosshairCanvasElement.height
				);
			updateStatsHeader();
		};
		const reader = new FileReader();
		reader.onload = (e_reader) => {
			uploadedImageElement.src = e_reader.target.result;
			uploadedImageElement.style.display = "block";
		};
		reader.onerror = (e_reader) => {
			console.error("FileReader 오류:", e_reader);
			alert("파일을 읽는 중 오류.");
			uploadedImageElement.style.display = "none";
			if (infoResolutionElement)
				infoResolutionElement.textContent = "파일 읽기 실패";
			if (infoSelectedImageFileElement)
				infoSelectedImageFileElement.textContent = "N/A";
			if (infoSelectedFolderElement)
				infoSelectedFolderElement.textContent = "N/A";
			updateStatsHeader();
		};
		reader.readAsDataURL(currentSelectedFileObject);
	}

	function resetUIForNewImageSelection() {
		currentClickedCameraX = null;
		currentClickedCameraY = null;
		popupGroundXElement.value = "";
		popupGroundYElement.value = "";
		popupEditingPointIdElement.value = "";
		popupTitleElement.textContent = "Ground Truth 입력";
		popupSubmitBtnElement.textContent = "저장";
		if (jsonResultCurrentElement)
			jsonResultCurrentElement.textContent = "{}";
		currentImageAnnotations = [];
		if (ctx)
			ctx.clearRect(
				0,
				0,
				crosshairCanvasElement.width,
				crosshairCanvasElement.height
			);
		crosshairTooltipElement.style.display = "none";
		crosshairTooltipElement.classList.remove("visible");
		updateStatsHeader();
	}

	function deriveAndDrawAnnotations() {
		currentImageAnnotations = [];
		if (currentImageDefinedPoints && currentImageDefinedPoints.length > 0) {
			currentImageDefinedPoints.forEach((point) => {
				currentImageAnnotations.push({
					...point,
					color: point.isGloballySaved ? "green" : "orange",
					type: point.isGloballySaved ? "saved" : "defined",
				});
			});
		}
		redrawCrosshairs();
		updateStatsHeader();
	}

	function drawCrosshair(x, y, color) {
		if (
			!imageNaturalWidth ||
			!imageNaturalHeight ||
			!uploadedImageElement.offsetWidth ||
			!uploadedImageElement.offsetHeight ||
			!ctx
		) {
			return;
		}
		const dXScale = crosshairCanvasElement.width / imageNaturalWidth,
			dYScale = crosshairCanvasElement.height / imageNaturalHeight;
		if (
			!isFinite(dXScale) ||
			!isFinite(dYScale) ||
			dXScale <= 0 ||
			dYScale <= 0
		) {
			console.error(
				"[drawCrosshair] Invalid scales based on natural/offset image size and canvas size:",
				{
					naturalW: imageNaturalWidth,
					naturalH: imageNaturalHeight,
					offsetWidth: uploadedImageElement.offsetWidth,
					offsetHeight: uploadedImageElement.offsetHeight,
					canvasW: crosshairCanvasElement.width,
					canvasH: crosshairCanvasElement.height,
					scaleX: dXScale,
					scaleY: dYScale,
				}
			);
			return;
		}
		const size = 10,
			cX = Math.max(5, size * dXScale),
			cY = Math.max(5, size * dYScale),
			dX = x * dXScale,
			dY = y * dYScale;
		ctx.beginPath();
		ctx.strokeStyle = color;
		ctx.lineWidth = 2;
		ctx.moveTo(dX - cX, dY);
		ctx.lineTo(dX + cX, dY);
		ctx.moveTo(dX, dY - cY);
		ctx.lineTo(dX, dY + cY);
		ctx.stroke();
	}

	function redrawCrosshairs() {
		if (
			!uploadedImageElement.offsetWidth ||
			!uploadedImageElement.offsetHeight ||
			!ctx
		) {
			if (ctx)
				ctx.clearRect(
					0,
					0,
					crosshairCanvasElement.width,
					crosshairCanvasElement.height
				);
			allCrosshairHotspots = [];
			return;
		}
		if (
			crosshairCanvasElement.width !== uploadedImageElement.offsetWidth ||
			crosshairCanvasElement.height !== uploadedImageElement.offsetHeight
		) {
			crosshairCanvasElement.width = uploadedImageElement.offsetWidth;
			crosshairCanvasElement.height = uploadedImageElement.offsetHeight;
		}
		ctx.clearRect(
			0,
			0,
			crosshairCanvasElement.width,
			crosshairCanvasElement.height
		);
		allCrosshairHotspots = [];
		if (currentImageAnnotations && currentImageAnnotations.length > 0) {
			currentImageAnnotations.forEach((ann) => {
				if (
					ann &&
					ann.camera_points &&
					ann.camera_points.length === 2
				) {
					drawCrosshair(
						ann.camera_points[0],
						ann.camera_points[1],
						ann.color
					);
					if (
						(ann.type === "saved" || ann.type === "defined") &&
						imageNaturalWidth > 0 &&
						imageNaturalHeight > 0
					) {
						const dXSc =
								crosshairCanvasElement.width /
								imageNaturalWidth,
							dYSc =
								crosshairCanvasElement.height /
								imageNaturalHeight;
						if (
							isFinite(dXSc) &&
							isFinite(dYSc) &&
							dXSc > 0 &&
							dYSc > 0
						) {
							const groundPoints =
								ann.ground_points &&
								Array.isArray(ann.ground_points)
									? ann.ground_points
									: ["N/A", "N/A"];
							allCrosshairHotspots.push({
								...ann,
								cx: ann.camera_points[0] * dXSc,
								cy: ann.camera_points[1] * dYSc,
								radius: 8,
								ground_points: groundPoints,
							});
						}
					}
				}
			});
		}
	}

	window.addEventListener("resize", () => {
		if (
			currentImageIdentifier &&
			uploadedImageElement.style.display === "block" &&
			uploadedImageElement.offsetWidth > 0
		) {
			setTimeout(() => {
				if (
					uploadedImageElement.offsetWidth > 0 &&
					uploadedImageElement.offsetHeight > 0
				) {
					crosshairCanvasElement.width =
						uploadedImageElement.offsetWidth;
					crosshairCanvasElement.height =
						uploadedImageElement.offsetHeight;
					redrawCrosshairs();
				}
			}, 100);
		}
	});

	uploadedImageElement.addEventListener("mousemove", (event) => {
		if (
			allCrosshairHotspots.length === 0 ||
			uploadedImageElement.style.display === "none" ||
			groundTruthPopupElement.style.display === "flex" ||
			crosshairActionMenuElement.style.display === "flex"
		) {
			crosshairTooltipElement.style.display = "none";
			crosshairTooltipElement.classList.remove("visible");
			return;
		}
		const imgRect = uploadedImageElement.getBoundingClientRect();
		const mouseX = event.clientX - imgRect.left,
			mouseY = event.clientY - imgRect.top;
		let hoveredHotspot = null;
		for (const hotspot of allCrosshairHotspots) {
			if (
				!hotspot ||
				typeof hotspot.cx !== "number" ||
				typeof hotspot.cy !== "number" ||
				typeof hotspot.radius !== "number"
			)
				continue;
			const distance = Math.sqrt(
				Math.pow(mouseX - hotspot.cx, 2) +
					Math.pow(mouseY - hotspot.cy, 2)
			);
			if (distance <= hotspot.radius) {
				hoveredHotspot = hotspot;
				break;
			}
		}
		if (hoveredHotspot) {
			const cp = hoveredHotspot.camera_points;
			const gp = hoveredHotspot.ground_points;
			const camText = `Pixel: [${
				cp && Array.isArray(cp) ? cp.join(", ") : "데이터 없음"
			}]`;
			const gndText = `Ground: [${
				gp && Array.isArray(gp) ? gp.join(", ") : "데이터 없음"
			}]`;
			crosshairTooltipElement.innerHTML = `${camText}<br>${gndText}`;
			crosshairTooltipElement.style.left = `${
				uploadedImageElement.offsetLeft + mouseX + 15
			}px`;
			crosshairTooltipElement.style.top = `${
				uploadedImageElement.offsetTop + mouseY + 15
			}px`;
			crosshairTooltipElement.style.display = "block";
			requestAnimationFrame(() => {
				crosshairTooltipElement.classList.add("visible");
			});
		} else {
			crosshairTooltipElement.classList.remove("visible");
			if (crosshairTooltipElement.style.display !== "none") {
				crosshairTooltipElement.style.display = "none";
			}
		}
	});
	uploadedImageElement.addEventListener("mouseleave", () => {
		crosshairTooltipElement.classList.remove("visible");
		crosshairTooltipElement.style.display = "none";
	});
	uploadedImageElement.addEventListener("mouseenter", () => {
		if (
			groundTruthPopupElement.style.display !== "flex" &&
			crosshairActionMenuElement.style.display !== "flex"
		) {
			crosshairTooltipElement.classList.remove("visible");
			crosshairTooltipElement.style.display = "none";
		}
	});

	uploadedImageElement.addEventListener("click", (event) => {
		if (
			!currentSelectedFileObject ||
			!imageNaturalWidth ||
			!imageNaturalHeight
		) {
			alert("먼저 이미지를 선택하고 로드해주세요.");
			return;
		}
		if (
			crosshairActionMenuElement.style.display === "flex" &&
			!crosshairActionMenuElement.contains(event.target)
		) {
			closeCrosshairActionMenu();
			return;
		}
		const imgRect = uploadedImageElement.getBoundingClientRect();
		const clickX = event.clientX - imgRect.left,
			clickY = event.clientY - imgRect.top;
		let clickedHotspot = null;
		for (const hotspot of allCrosshairHotspots) {
			if (
				!hotspot ||
				typeof hotspot.cx !== "number" ||
				typeof hotspot.cy !== "number" ||
				typeof hotspot.radius !== "number"
			)
				continue;
			const distance = Math.sqrt(
				Math.pow(clickX - hotspot.cx, 2) +
					Math.pow(clickY - hotspot.cy, 2)
			);
			if (distance <= hotspot.radius) {
				clickedHotspot = hotspot;
				break;
			}
		}
		if (clickedHotspot) {
			event.preventDefault();
			event.stopPropagation();
			activeHotspotForMenu = clickedHotspot;
			showCrosshairActionMenu(
				clickedHotspot,
				event.clientX,
				event.clientY
			);
		} else {
			closeCrosshairActionMenu();
			currentClickedCameraX = Math.round(
				clickX * (imageNaturalWidth / imgRect.width)
			);
			currentClickedCameraY = Math.round(
				clickY * (imageNaturalHeight / imgRect.height)
			);
			currentClickedCameraX = Math.max(
				0,
				Math.min(currentClickedCameraX, imageNaturalWidth)
			);
			currentClickedCameraY = Math.max(
				0,
				Math.min(currentClickedCameraY, imageNaturalHeight)
			);
			popupCameraCoordsElement.textContent = `x: ${currentClickedCameraX}, y: ${currentClickedCameraY}`;
			popupEditingPointIdElement.value = "";
			popupTitleElement.textContent = "새 주석 추가";
			popupGroundXElement.value = "";
			popupGroundYElement.value = "";
			popupSubmitBtnElement.textContent = "저장";
			groundTruthPopupElement.style.display = "flex";
			crosshairTooltipElement.style.display = "none";
			crosshairTooltipElement.classList.remove("visible");
			deriveAndDrawAnnotations();
			if (
				currentClickedCameraX !== null &&
				currentClickedCameraY !== null
			) {
				drawCrosshair(
					currentClickedCameraX,
					currentClickedCameraY,
					"red"
				);
			}
		}
	});

	function showCrosshairActionMenu(hotspot, clientX, clientY) {
		crosshairActionMenuElement.innerHTML = "";
		crosshairTooltipElement.style.display = "none";
		crosshairTooltipElement.classList.remove("visible");
		const pointData = currentImageDefinedPoints.find(
			(p) => p.id === hotspot.id
		);
		if (!pointData) {
			console.error(
				"ActionMenu: Point data not found for hotspot ID:",
				hotspot.id
			);
			return;
		}

		console.log(
			`ActionMenu: PointData for menu (ID: ${pointData.id}):`,
			JSON.parse(JSON.stringify(pointData))
		);

		function createButton(text, onClickAction) {
			const button = document.createElement("button");
			button.textContent = text;
			console.log(
				`ActionMenu: Button created. Text content is: "${button.textContent}" for input text "${text}"`
			);
			button.onclick = () => {
				onClickAction();
				closeCrosshairActionMenu();
			};
			return button;
		}

		crosshairActionMenuElement.appendChild(
			createButton("수정", () => handleEditPoint(null, pointData.id))
		);
		if (pointData.isGloballySaved) {
			crosshairActionMenuElement.appendChild(
				createButton("임시 측량으로 변경", () =>
					handleDemoteFromGlobal(pointData.id)
				)
			);
		} else {
			crosshairActionMenuElement.appendChild(
				createButton("측량 확정", () =>
					handleToggleGlobalStatus(null, pointData.id, true)
				)
			);
			const deleteBtn = createButton("삭제 (완전)", () =>
				handleDeletePoint(null, pointData.id)
			);
			deleteBtn.classList.add("delete-point-btn");
			crosshairActionMenuElement.appendChild(deleteBtn);
		}

		crosshairActionMenuElement.style.display = "flex";
		requestAnimationFrame(() => {
			const menuWidth = crosshairActionMenuElement.offsetWidth || 150;
			const menuHeight = crosshairActionMenuElement.offsetHeight || 80;
			let top = clientY + 5;
			let left = clientX + 5;
			if (left + menuWidth > window.innerWidth)
				left = clientX - menuWidth - 5;
			if (top + menuHeight > window.innerHeight)
				top = clientY - menuHeight - 5;
			top = Math.max(
				5,
				Math.min(top, window.innerHeight - menuHeight - 5)
			);
			left = Math.max(
				5,
				Math.min(left, window.innerWidth - menuWidth - 5)
			);
			crosshairActionMenuElement.style.top = `${top}px`;
			crosshairActionMenuElement.style.left = `${left}px`;
		});
	}

	function closeCrosshairActionMenu() {
		crosshairActionMenuElement.style.display = "none";
		activeHotspotForMenu = null;
	}

	function closePopup() {
		groundTruthPopupElement.style.display = "none";
		popupEditingPointIdElement.value = "";
		currentClickedCameraX = null;
		currentClickedCameraY = null;
		deriveAndDrawAnnotations();
	}
	closePopupBtnElement.addEventListener("click", closePopup);
	popupCancelBtnElement.addEventListener("click", closePopup);

	popupSubmitBtnElement.addEventListener("click", async () => {
		if (currentClickedCameraX === null || currentClickedCameraY === null) {
			alert("카메라 좌표를 지정해주세요.");
			return;
		}
		const gx = popupGroundXElement.value,
			gy = popupGroundYElement.value;
		if (gx === "" || gy === "") {
			alert("Ground X, Y 값을 모두 입력해주세요.");
			return;
		}
		const gX = parseFloat(gx),
			gY = parseFloat(gy);
		if (isNaN(gX) || isNaN(gY)) {
			alert("Ground X, Y는 유효한 실수여야 합니다.");
			return;
		}
		const payload = {
			camera_points: [currentClickedCameraX, currentClickedCameraY],
			ground_points: [gX, gY],
		};
		const editingId = popupEditingPointIdElement.value;
		try {
			let resPoint;
			if (editingId) {
				const res = await fetch(
					`/api/images/${encodeURIComponent(
						currentImageIdentifier
					)}/defined-points/${editingId}`,
					{
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(payload),
					}
				);
				if (!res.ok) throw new Error(`수정 실패(${res.status})`);
				resPoint = await res.json();
				const idx = currentImageDefinedPoints.findIndex(
					(p) => p.id === editingId
				);
				if (idx !== -1) {
					currentImageDefinedPoints[idx] = resPoint;
					if (resPoint.isGloballySaved) {
						const globalIdx = globalJsonData.data.findIndex(
							(p) => p.id === editingId
						);
						if (globalIdx !== -1) {
							globalJsonData.data[globalIdx] = { ...resPoint };
							jsonResultGlobalElement.textContent =
								JSON.stringify(globalJsonData, null, 2);
						}
					}
				}
			} else {
				const newId = generateUUID();
				const res = await fetch(
					`/api/images/${encodeURIComponent(
						currentImageIdentifier
					)}/defined-points`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							...payload,
							id: newId,
							isGloballySaved: false,
						}),
					}
				);
				if (!res.ok) throw new Error(`추가 실패(${res.status})`);
				resPoint = await res.json();
				currentImageDefinedPoints.push(resPoint);
			}
			if (jsonResultCurrentElement)
				jsonResultCurrentElement.textContent = JSON.stringify(
					resPoint,
					null,
					2
				);
			renderDefinedPointsList();
			deriveAndDrawAnnotations();
			closePopup();
		} catch (err) {
			console.error("저장/수정 오류:", err);
			alert(`오류: ${err.message}`);
		}
	});

	function renderDefinedPointsList() {
		const listElement = document.getElementById("definedPointsList");
		if (
			listElement &&
			listElement.parentElement &&
			getComputedStyle(listElement.parentElement).display !== "none"
		) {
			listElement.innerHTML = "";
			if (
				!currentImageDefinedPoints ||
				currentImageDefinedPoints.length === 0
			) {
				listElement.innerHTML =
					"<li>이 이미지에 정의된 주석이 없습니다.</li>";
			} else {
				currentImageDefinedPoints.forEach((point) => {
					const listItem = document.createElement("li");
					listItem.dataset.pointId = point.id;
					if (point.isGloballySaved)
						listItem.classList.add("globally-saved");
					const pre = document.createElement("pre");
					pre.textContent = JSON.stringify(
						{
							id: point.id.substring(0, 8) + "...",
							cam: point.camera_points,
							gnd: point.ground_points,
							isGloballySaved: point.isGloballySaved,
						},
						null,
						2
					);
					listItem.appendChild(pre);
					const buttonsDiv = document.createElement("div");
					buttonsDiv.classList.add("point-buttons");
					const editButton = document.createElement("button");
					editButton.textContent = "수정";
					editButton.dataset.id = point.id;
					editButton.addEventListener("click", (e) =>
						handleEditPoint(e, point.id)
					);
					buttonsDiv.appendChild(editButton);
					const addGlobalButton = document.createElement("button");
					addGlobalButton.textContent = point.isGloballySaved
						? "✓ 측량 확정"
						: "측량 확정";
					addGlobalButton.classList.add("add-global-btn");
					if (point.isGloballySaved) addGlobalButton.disabled = true;
					addGlobalButton.dataset.id = point.id;
					addGlobalButton.addEventListener("click", (e) =>
						handleToggleGlobalStatus(e, point.id, true)
					);
					buttonsDiv.appendChild(addGlobalButton);
					const deleteButton = document.createElement("button");
					deleteButton.textContent = "삭제";
					deleteButton.classList.add("delete-point-btn");
					deleteButton.dataset.id = point.id;
					deleteButton.addEventListener("click", (e) =>
						handleDeletePoint(e, point.id)
					);
					buttonsDiv.appendChild(deleteButton);
					listItem.appendChild(buttonsDiv);
					listElement.appendChild(listItem);
				});
			}
		}
		updateStatsHeader();
	}

	function handleEditPoint(event, pointIdToEdit) {
		if (!pointIdToEdit && event) pointIdToEdit = event.target.dataset.id;
		const point = currentImageDefinedPoints.find(
			(p) => p.id === pointIdToEdit
		);
		if (!point) return;
		popupEditingPointIdElement.value = pointIdToEdit;
		popupTitleElement.textContent = `주석 수정 (ID: ...${pointIdToEdit.slice(
			-8
		)})`;
		popupSubmitBtnElement.textContent = "수정 내용 저장";
		currentClickedCameraX = point.camera_points[0];
		currentClickedCameraY = point.camera_points[1];
		popupCameraCoordsElement.textContent = `x: ${currentClickedCameraX}, y: ${currentClickedCameraY}`;
		popupGroundXElement.value = point.ground_points[0];
		popupGroundYElement.value = point.ground_points[1];
		if (jsonResultCurrentElement)
			jsonResultCurrentElement.textContent = JSON.stringify(
				point,
				null,
				2
			);
		groundTruthPopupElement.style.display = "flex";
		crosshairTooltipElement.style.display = "none";
		crosshairTooltipElement.classList.remove("visible");
		deriveAndDrawAnnotations();
		drawCrosshair(point.camera_points[0], point.camera_points[1], "blue");
	}

	async function handleToggleGlobalStatus(event, pointId, newStatus) {
		if (!pointId && event) pointId = event.target.dataset.id;
		const point = currentImageDefinedPoints.find((p) => p.id === pointId);
		if (
			!point ||
			!currentImageIdentifier ||
			point.isGloballySaved === newStatus
		) {
			if (point && point.isGloballySaved === newStatus)
				alert(
					newStatus ? "이미 측량 확정됨." : "이미 임시 측량 상태임."
				);
			return;
		}
		try {
			const res = await fetch(
				`/api/images/${encodeURIComponent(
					currentImageIdentifier
				)}/defined-points/${pointId}/global-status`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ isGloballySaved: newStatus }),
				}
			);
			if (!res.ok) throw new Error(`상태 변경 실패(${res.status})`);
			const updatedPt = await res.json();
			const idx = currentImageDefinedPoints.findIndex(
				(p) => p.id === pointId
			);
			if (idx !== -1) currentImageDefinedPoints[idx] = updatedPt;

			if (updatedPt.isGloballySaved) {
				if (!globalJsonData.data.some((p) => p.id === updatedPt.id)) {
					globalJsonData.data.push({ ...updatedPt });
				} else {
					const globalIdx = globalJsonData.data.findIndex(
						(p) => p.id === updatedPt.id
					);
					if (globalIdx !== -1)
						globalJsonData.data[globalIdx] = { ...updatedPt };
				}
			} else {
				globalJsonData.data = globalJsonData.data.filter(
					(p) => p.id !== pointId
				);
			}
			jsonResultGlobalElement.textContent = JSON.stringify(
				globalJsonData,
				null,
				2
			);

			renderDefinedPointsList();
			deriveAndDrawAnnotations();
			updateStatsHeader();
		} catch (err) {
			console.error("Global 상태 변경 오류:", err);
			alert(`오류: ${err.message}`);
		}
	}

	async function handleDemoteFromGlobal(pointId) {
		await handleToggleGlobalStatus(null, pointId, false);
	}

	async function handleDeletePoint(event, pointId) {
		if (!pointId && event) pointId = event.target.dataset.id;
		const point = currentImageDefinedPoints.find((p) => p.id === pointId);
		if (
			!point ||
			!currentImageIdentifier ||
			!confirm(`주석(ID: ...${pointId.slice(-8)})을 완전히 삭제합니까?`)
		)
			return;
		try {
			const res = await fetch(
				`/api/images/${encodeURIComponent(
					currentImageIdentifier
				)}/defined-points/${pointId}`,
				{ method: "DELETE" }
			);
			if (!res.ok && res.status !== 204)
				throw new Error(`삭제 실패(${res.status})`);
			currentImageDefinedPoints = currentImageDefinedPoints.filter(
				(p) => p.id !== pointId
			);
			if (point.isGloballySaved) {
				globalJsonData.data = globalJsonData.data.filter(
					(p) => p.id !== pointId
				);
				jsonResultGlobalElement.textContent = JSON.stringify(
					globalJsonData,
					null,
					2
				);
			}
			renderDefinedPointsList();
			deriveAndDrawAnnotations();
			if (jsonResultCurrentElement)
				jsonResultCurrentElement.textContent = "{}";
			updateStatsHeader();
		} catch (err) {
			console.error("삭제 오류:", err);
			alert(`오류: ${err.message}`);
		}
	}

	// 기존 resetGlobalJsonBtnElement 이벤트 리스너 (특정 위치의 버튼)
	if (resetGlobalJsonBtnElement) {
		resetGlobalJsonBtnElement.addEventListener("click", async () => {
			if (
				!confirm(
					"모든 이미지의 주석과 완료 상태를 서버에서도 초기화합니까? 되돌릴 수 없습니다!"
				)
			)
				return;
			try {
				const res = await fetch("/api/all-data", { method: "DELETE" });
				if (!res.ok) throw new Error(`초기화 실패(${res.status})`);
				globalJsonData = { data: [] };
				clientCalibrationResult = null;
				jsonResultGlobalElement.textContent = JSON.stringify(
					globalJsonData,
					null,
					2
				);
				if (calibrationOutputJsonElement)
					calibrationOutputJsonElement.value = "";

				if (currentImageIdentifier && currentSelectedFileObject)
					await selectImage(currentSelectedFileObject);
				else clearMainContentForNewFolder();
				if (allFilesInFolder.length > 0) await renderImageList();
				else imageListElement.innerHTML = "<li>폴더 선택 필요.</li>";
				alert("모든 서버 및 클라이언트 데이터 초기화 완료.");
				updateStatsHeader();
			} catch (err) {
				console.error("초기화 오류:", err);
				alert(`오류: ${err.message}`);
			}
		});
	}

	// 플로팅 전체 캐시 초기화 버튼 이벤트 리스너
	if (floatingResetAllCacheBtnElement) {
		floatingResetAllCacheBtnElement.addEventListener("click", async () => {
			if (
				!confirm(
					"정말로 모든 서버 캐시 데이터 (주석, 캘리브레이션 결과, 이미지별 작업 상태)를 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다!"
				)
			) {
				return;
			}
			try {
				const response = await fetch("/api/all-data", {
					method: "DELETE",
				});
				if (!response.ok) {
					const errorData = await response
						.json()
						.catch(() => ({
							message: `서버 초기화 실패 (${response.status})`,
						}));
					throw new Error(errorData.message);
				}

				globalJsonData = { data: [] };
				clientCalibrationResult = null;
				currentImageDefinedPoints = [];
				currentImageAnnotations = [];
				allCrosshairHotspots = [];

				if (jsonResultGlobalElement)
					jsonResultGlobalElement.textContent = JSON.stringify(
						globalJsonData,
						null,
						2
					);
				if (calibrationOutputJsonElement)
					calibrationOutputJsonElement.value = "";
				if (jsonResultCurrentElement)
					jsonResultCurrentElement.textContent = "{}";
				if (definedPointsListElement)
					definedPointsListElement.innerHTML =
						"<li>이 이미지에 정의된 주석이 없습니다.</li>";
				if (ctx)
					ctx.clearRect(
						0,
						0,
						crosshairCanvasElement.width,
						crosshairCanvasElement.height
					);

				if (currentImageIdentifier) {
					const listItem = document.querySelector(
						`#imageList li[data-image-name="${currentImageIdentifier}"]`
					);
					if (listItem) {
						listItem.classList.remove(
							"completed",
							"active-selection"
						);
					}
					uploadedImageElement.style.display = "none";
					uploadedImageElement.src = "#";
					if (infoSelectedImageFileElement)
						infoSelectedImageFileElement.textContent = "N/A";
					if (infoResolutionElement)
						infoResolutionElement.textContent = "N/A";
					markCompleteBtnElement.style.display = "none";
				} else {
					clearMainContentForNewFolder();
				}

				document
					.querySelectorAll("#imageList li.completed")
					.forEach((li) => li.classList.remove("completed"));

				if (
					document
						.getElementById("viewHomographyCalc")
						.classList.contains("current-view")
				) {
					if (homographyResultTextElement)
						homographyResultTextElement.textContent =
							"결과 대기 중...";
					updateHomographyCalcStatusIcon("waiting");
					checkHomographyPrerequisites();
				}

				updateStatsHeader();
				alert(
					"모든 서버 및 클라이언트 캐시 데이터가 초기화되었습니다."
				);
			} catch (error) {
				console.error("전체 캐시 초기화 중 오류:", error);
				alert(`오류 발생: ${error.message}`);
			}
		});
	}

	exportJsonBtnElement.addEventListener("click", () => {
		if (
			!globalJsonData ||
			!globalJsonData.data ||
			globalJsonData.data.length === 0
		) {
			alert("내보낼 데이터 없음.");
			return;
		}
		try {
			const str = JSON.stringify(globalJsonData, null, 2),
				blob = new Blob([str], { type: "application/json" }),
				url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			const now = new Date();
			a.download = `annotations_${now.getFullYear()}${(now.getMonth() + 1)
				.toString()
				.padStart(2, "0")}${now
				.getDate()
				.toString()
				.padStart(2, "0")}_${now
				.getHours()
				.toString()
				.padStart(2, "0")}${now
				.getMinutes()
				.toString()
				.padStart(2, "0")}${now
				.getSeconds()
				.toString()
				.padStart(2, "0")}.json`;
			document.body.appendChild(a);
			a.click();
			setTimeout(() => {
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			}, 100);
		} catch (err) {
			console.error("내보내기 오류:", err);
			alert("내보내기 중 오류 발생.");
		}
	});

	importJsonBtnElement.addEventListener("click", () => {
		importJsonFileElement.click();
	});
	importJsonFileElement.addEventListener("change", (event) => {
		const file = event.target.files[0];
		if (!file) return;
		if (!file.name.endsWith(".json")) {
			alert("JSON 파일 선택.");
			importJsonFileElement.value = "";
			return;
		}
		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const data = JSON.parse(e.target.result);
				if (data && Array.isArray(data.data)) {
					if (
						confirm(
							"현재 전체 JSON 데이터를 불러온 파일 내용으로 대체합니까?"
						)
					) {
						globalJsonData = data;
						jsonResultGlobalElement.textContent = JSON.stringify(
							globalJsonData,
							null,
							2
						);
						updateStatsHeader();
						alert(
							"JSON 불러오기 완료.\n(주의: 서버 데이터와 자동 동기화 안됨. 'Save' 버튼으로 서버에 저장 필요)"
						);
					}
				} else
					alert("잘못된 JSON 형식. '{\"data\":[...]}' 구조여야 함.");
			} catch (err) {
				console.error("JSON 불러오기 오류:", err);
				alert(`JSON 분석 오류: ${err.message}`);
			} finally {
				importJsonFileElement.value = "";
			}
		};
		reader.onerror = () => {
			alert("파일 읽기 오류.");
			importJsonFileElement.value = "";
		};
		reader.readAsText(file);
	});

	markCompleteBtnElement.addEventListener("click", async () => {
		if (!currentImageIdentifier) {
			alert("완료할 이미지 선택 안됨.");
			return;
		}
		try {
			const res = await fetch(
				`/api/images/${encodeURIComponent(
					currentImageIdentifier
				)}/complete`,
				{ method: "POST" }
			);
			if (!res.ok) throw new Error(`완료 상태 변경 실패(${res.status})`);
			const li = document.querySelector(
				`#imageList li[data-image-name="${currentImageIdentifier}"]`
			);
			if (li) li.classList.add("completed");
		} catch (err) {
			console.error("완료 처리 오류:", err);
			alert(`오류: ${err.message}`);
		}
	});

	function updateStatsHeader() {
		if (statsTotalConfirmedElement)
			statsTotalConfirmedElement.textContent = globalJsonData.data
				? globalJsonData.data.length
				: 0;
		let tempCnt = 0,
			confCnt = 0;
		if (currentImageDefinedPoints) {
			tempCnt = currentImageDefinedPoints.filter(
				(p) => !p.isGloballySaved
			).length;
			confCnt = currentImageDefinedPoints.filter(
				(p) => p.isGloballySaved
			).length;
		}
		if (statsCurrentImageTemporaryElement)
			statsCurrentImageTemporaryElement.textContent = tempCnt;
		if (statsCurrentImageConfirmedElement)
			statsCurrentImageConfirmedElement.textContent = confCnt;
	}

	// --- "캘리브레이션 결과 JSON 변환" 뷰 로직 ---
	if (
		convertToJsonBtnElement &&
		calibrationInputTextElement &&
		calibrationOutputJsonElement
	) {
		convertToJsonBtnElement.addEventListener("click", () => {
			const inputText = calibrationInputTextElement.value;
			if (!inputText.trim()) {
				alert("입력된 텍스트가 없습니다.");
				return;
			}
			const lines = inputText.split("\n");
			const params = {};
			const relevantKeys = [
				"fx",
				"fy",
				"cx",
				"cy",
				"k1",
				"k2",
				"k3",
				"p1",
				"p2",
				"skew",
			];
			lines.forEach((line) => {
				const parts = line.split("=");
				if (parts.length === 2) {
					const key = parts[0].trim();
					const value = parseFloat(parts[1].trim());
					if (relevantKeys.includes(key) && !isNaN(value))
						params[key] = value;
				}
			});
			const outputJsonData = {
				CalibrationInfo: {
					fx: params.fx || 0,
					fy: params.fy || 0,
					cx: params.cx || 0,
					cy: params.cy || 0,
					skew: params.skew || 0,
					k1: params.k1 || 0,
					k2: params.k2 || 0,
					k3: params.k3 || 0,
					p1: params.p1 || 0,
					p2: params.p2 || 0,
				},
			};
			calibrationOutputJsonElement.value = JSON.stringify(
				outputJsonData,
				null,
				4
			);
		});
	}
	if (
		resetCalibrationTextBtnElement &&
		calibrationInputTextElement &&
		calibrationOutputJsonElement
	) {
		resetCalibrationTextBtnElement.addEventListener("click", () => {
			calibrationInputTextElement.value = "";
			calibrationOutputJsonElement.value = "";
		});
	}
	if (saveCalibrationResultBtnElement && calibrationOutputJsonElement) {
		saveCalibrationResultBtnElement.addEventListener("click", async () => {
			const jsonOutputText = calibrationOutputJsonElement.value;
			if (!jsonOutputText.trim()) {
				alert(
					"서버에 저장할 캘리브레이션 결과 JSON 데이터가 없습니다."
				);
				return;
			}
			try {
				const calibrationDataToSave = JSON.parse(jsonOutputText);
				const response = await fetch("/api/calibration-result/save", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(calibrationDataToSave),
				});
				if (!response.ok) {
					const errData = await response.json().catch(() => ({
						message: `캘리브레이션 결과 저장 실패 (${response.status})`,
					}));
					throw new Error(errData.message);
				}
				clientCalibrationResult = calibrationDataToSave;
				alert(
					"캘리브레이션 결과가 서버에 성공적으로 저장(캐시)되었습니다."
				);
			} catch (error) {
				console.error("캘리브레이션 결과 저장 오류:", error);
				alert(
					`JSON 파싱 또는 서버 저장 중 오류가 발생했습니다: ${error.message}`
				);
			}
		});
	}
	if (saveGlobalJsonBtnElement) {
		saveGlobalJsonBtnElement.addEventListener("click", async () => {
			if (
				!globalJsonData ||
				!globalJsonData.data ||
				globalJsonData.data.length === 0
			) {
				alert("서버에 저장할 전체 JSON 데이터가 없습니다.");
				return;
			}
			try {
				const response = await fetch("/api/global-annotations/save", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(globalJsonData),
				});
				if (!response.ok) {
					const errData = await response.json().catch(() => ({
						message: `전체 JSON 데이터 저장 실패 (${response.status})`,
					}));
					throw new Error(errData.message);
				}
				alert(
					"전체 JSON 데이터가 서버에 성공적으로 저장(캐시)되었습니다."
				);
			} catch (error) {
				console.error("전체 JSON 데이터 저장 오류:", error);
				alert(`오류: ${error.message}`);
			}
		});
	}

	// --- Homography 연산 페이지 로직 ---
	function updateHomographyCalcStatusIcon(type = "waiting") {
		if (homographyCalcStatusIconElement) {
			homographyCalcStatusIconElement.className = "status-icon"; // 기본 클래스만 남김
			homographyCalcStatusIconElement.classList.add(type); // 현재 상태 클래스 추가
			// 아이콘은 CSS의 ::before 가상 요소를 통해 content로 설정되므로, textContent는 비워둡니다.
			homographyCalcStatusIconElement.textContent = "";
		}
	}

	async function checkHomographyPrerequisites() {
		if (
			!statusGlobalAnnotationsElement ||
			!statusCalibrationResultElement ||
			!statusCppApiServerElement ||
			!requestHomographyBtnElement
		)
			return;

		statusGlobalAnnotationsElement.textContent = "확인 중...";
		statusCalibrationResultElement.textContent = "확인 중...";
		statusCppApiServerElement.textContent = "확인 중...";
		requestHomographyBtnElement.disabled = true;
		if (viewGlobalAnnotationsJsonBtnElement)
			viewGlobalAnnotationsJsonBtnElement.disabled = true;
		if (viewCalibrationResultJsonBtnElement)
			viewCalibrationResultJsonBtnElement.disabled = true;

		try {
			const response = await fetch("/api/homography/status");
			if (!response.ok) {
				throw new Error(`서버 상태 확인 실패 (${response.status})`);
			}
			const status = await response.json();

			statusGlobalAnnotationsElement.textContent =
				status.hasGlobalAnnotations ? "데이터 있음" : "데이터 없음";
			statusGlobalAnnotationsElement.style.color =
				status.hasGlobalAnnotations ? "green" : "red";
			if (viewGlobalAnnotationsJsonBtnElement)
				viewGlobalAnnotationsJsonBtnElement.disabled =
					!status.hasGlobalAnnotations;

			statusCalibrationResultElement.textContent =
				status.hasCalibrationResult ? "데이터 있음" : "데이터 없음";
			statusCalibrationResultElement.style.color =
				status.hasCalibrationResult ? "green" : "red";
			if (viewCalibrationResultJsonBtnElement)
				viewCalibrationResultJsonBtnElement.disabled =
					!status.hasCalibrationResult;

			if (!status.isCppApiConfigured) {
				statusCppApiServerElement.textContent = "C++ API 구성 안됨";
				statusCppApiServerElement.style.color = "orange";
			} else {
				statusCppApiServerElement.textContent = status.isCppApiOnline
					? "온라인"
					: "오프라인";
				statusCppApiServerElement.style.color = status.isCppApiOnline
					? "green"
					: "red";
			}

			if (
				status.hasGlobalAnnotations &&
				status.hasCalibrationResult &&
				status.isCppApiConfigured &&
				status.isCppApiOnline
			) {
				requestHomographyBtnElement.disabled = false;
			} else {
				requestHomographyBtnElement.disabled = true;
			}
		} catch (error) {
			console.error("Homography 상태 확인 오류:", error);
			statusGlobalAnnotationsElement.textContent = "오류";
			statusCalibrationResultElement.textContent = "오류";
			statusCppApiServerElement.textContent = "오류";
			statusGlobalAnnotationsElement.style.color = "red";
			statusCalibrationResultElement.style.color = "red";
			statusCppApiServerElement.style.color = "red";
			if (viewGlobalAnnotationsJsonBtnElement)
				viewGlobalAnnotationsJsonBtnElement.disabled = true;
			if (viewCalibrationResultJsonBtnElement)
				viewCalibrationResultJsonBtnElement.disabled = true;
			alert(`상태 확인 중 오류 발생: ${error.message}`);
		}
	}

	// JSON 보기 팝업 열기 함수
	function showJsonPopup(title, jsonData) {
		if (jsonDisplayPopupTitleElement)
			jsonDisplayPopupTitleElement.textContent = title;
		if (jsonDisplayPopupContentElement)
			jsonDisplayPopupContentElement.textContent = JSON.stringify(
				jsonData,
				null,
				2
			);
		if (jsonDisplayPopupElement)
			jsonDisplayPopupElement.style.display = "flex";
	}

	// JSON 보기 팝업 닫기 함수
	function closeJsonPopup() {
		if (jsonDisplayPopupElement)
			jsonDisplayPopupElement.style.display = "none";
		if (jsonDisplayPopupContentElement)
			jsonDisplayPopupContentElement.textContent = "";
	}

	// JSON 보기 팝업 닫기 버튼 이벤트 리스너
	if (closeJsonDisplayPopupBtnElement) {
		closeJsonDisplayPopupBtnElement.addEventListener(
			"click",
			closeJsonPopup
		);
	}

	if (refreshHomographyStatusBtnElement) {
		refreshHomographyStatusBtnElement.addEventListener("click", () => {
			if (homographyResultTextElement) {
				homographyResultTextElement.textContent = "결과 대기 중...";
			}
			updateHomographyCalcStatusIcon("waiting");
			checkHomographyPrerequisites();
		});
	}

	if (viewGlobalAnnotationsJsonBtnElement) {
		viewGlobalAnnotationsJsonBtnElement.addEventListener(
			"click",
			async () => {
				try {
					const response = await fetch("/api/global-annotations");
					if (!response.ok)
						throw new Error("전체 주석 데이터 로드 실패");
					const data = await response.json();
					showJsonPopup("전체 주석 데이터 (서버 캐시)", data);
				} catch (error) {
					alert(`데이터 보기 오류: ${error.message}`);
				}
			}
		);
	}

	if (viewCalibrationResultJsonBtnElement) {
		viewCalibrationResultJsonBtnElement.addEventListener(
			"click",
			async () => {
				try {
					const response = await fetch("/api/calibration-result");
					if (!response.ok)
						throw new Error("캘리브레이션 결과 로드 실패");
					const data = await response.json();
					showJsonPopup("캘리브레이션 결과 (서버 캐시)", data);
				} catch (error) {
					alert(`데이터 보기 오류: ${error.message}`);
				}
			}
		);
	}

	if (requestHomographyBtnElement) {
		requestHomographyBtnElement.addEventListener("click", async () => {
			homographyResultTextElement.textContent = "연산 요청 중...";
			updateHomographyCalcStatusIcon("waiting");
			requestHomographyBtnElement.disabled = true;

			try {
				const response = await fetch("/api/homography/calculate", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
				});

				const result = await response.json();

				if (!response.ok) {
					updateHomographyCalcStatusIcon("error");
					throw new Error(
						result.message ||
							`Homography 연산 실패 (${response.status})`
					);
				}

				if (
					result.success &&
					result.homography_matrix &&
					Array.isArray(result.homography_matrix)
				) {
					const matrix = result.homography_matrix;
					let formattedMatrixString = "";
					if (
						matrix.length === 3 &&
						matrix.every(
							(row) => Array.isArray(row) && row.length === 3
						)
					) {
						formattedMatrixString =
							"[" +
							matrix.map((row) => row.join(", ")).join("; ") +
							"]";
					} else {
						formattedMatrixString = JSON.stringify(matrix);
					}
					result.homography_matrix = formattedMatrixString;
				}

				homographyResultTextElement.textContent = JSON.stringify(
					result,
					null,
					2
				);
				updateHomographyCalcStatusIcon(
					result.success ? "success" : "error"
				);
			} catch (error) {
				console.error("Homography 연산 요청 오류:", error);
				homographyResultTextElement.textContent = `오류: ${error.message}`;
				updateHomographyCalcStatusIcon("error");
				alert(`Homography 연산 중 오류 발생: ${error.message}`);
			} finally {
				checkHomographyPrerequisites();
			}
		});
	}

	// --- 초기 실행 ---
	async function initializeApp() {
		imageListElement.innerHTML = "<li>폴더를 선택해주세요.</li>";
		imageSelectionPromptElement.textContent =
			"좌측 상단의 '폴더 선택' 버튼으로 작업할 이미지 폴더를 지정해주세요.";

		try {
			const annRes = await fetch("/api/global-annotations");
			if (annRes.ok) globalJsonData = await annRes.json();
			else globalJsonData = { data: [] };

			const calRes = await fetch("/api/calibration-result");
			if (calRes.ok) clientCalibrationResult = await calRes.json();
			else clientCalibrationResult = null;
		} catch (e) {
			console.warn("초기 데이터 로드 실패:", e);
			globalJsonData = { data: [] };
			clientCalibrationResult = null;
		}

		jsonResultGlobalElement.textContent = JSON.stringify(
			globalJsonData,
			null,
			2
		);
		if (calibrationOutputJsonElement && clientCalibrationResult) {
			calibrationOutputJsonElement.value = JSON.stringify(
				clientCalibrationResult,
				null,
				4
			);
		}

		renderDefinedPointsList();
		updateStatsHeader();
		if (mainNavigationMenuElement)
			mainNavigationMenuElement.classList.add("visually-hidden");
		switchView("viewCoordInput");
	}

	initializeApp();
});
