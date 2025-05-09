// cpp_opencv_api/src/HomographyCalculator.cpp

#include "HomographyCalculator.h"
#include "MgenLogger.h" // 사용자 제공 로거

// POST 요청 JSON 본문 내에서 기대하는 주요 키 이름들
// 예시 요청 본문 구조:
// {
//   "calibration_config": { /* Calibrator가 기대하는 JSON 구조 */ },
//   "survey_data": {
//     "data": [
//       { "camera_coords": [x1, y1], "ground_coords": [gx1, gy1] },
//       { "camera_coords": [x2, y2], "ground_coords": [gx2, gy2] },
//       ...
//     ]
//   }
// }
// 아래는 위 구조에서 survey_data 객체 내의 포인트 배열을 가리키는 키입니다.
constexpr auto SURVEY_POINTS_ARRAY_KEY_IN_SURVEY_DATA = "data";
// survey_points_array 내 각 객체에서 카메라 좌표 배열과 지상 좌표 배열을 가리키는 키입니다.
constexpr auto CAMERA_COORDS_ARRAY_KEY_IN_POINT_OBJECT = "camera_coords";
constexpr auto GROUND_COORDS_ARRAY_KEY_IN_POINT_OBJECT = "ground_coords";


HomographyCalculator::HomographyCalculator() {
    // MGEN 로거가 main에서 초기화된다고 가정합니다.
    // 이 클래스 생성 시 특별한 초기화가 필요하다면 여기에 작성합니다.
    MLOG_INFO("HomographyCalculator instance created.");
}

cv::Point2f HomographyCalculator::getCoordFromJsonArray(const nlohmann::json& object,
                                                      const std::string& point_array_key,
                                                      size_t index_x,
                                                      size_t index_y) {
    // 키 존재 여부 및 타입 확인
    if (!object.contains(point_array_key)) {
        MLOG_WARN("JSON object does not contain key '%s'. Returning (0,0).", point_array_key.c_str());
        return cv::Point2f{0.0f, 0.0f};
    }
    if (!object.at(point_array_key).is_array()) {
        MLOG_WARN("JSON key '%s' is not an array. Returning (0,0).", point_array_key.c_str());
        return cv::Point2f{0.0f, 0.0f};
    }
    if (object.at(point_array_key).size() <= std::max(index_x, index_y)) {
        MLOG_WARN("JSON array for key '%s' has insufficient elements (size: %d, needed: max(%d,%d)+1). Returning (0,0).",
                  point_array_key.c_str(), object.at(point_array_key).size(), index_x, index_y);
        return cv::Point2f{0.0f, 0.0f};
    }

    // 값 파싱 시도
    try {
        return cv::Point2f{
            object.at(point_array_key).at(index_x).get<float>(), // 인덱스로 접근
            object.at(point_array_key).at(index_y).get<float>()  // 인덱스로 접근
        };
    } catch (const nlohmann::json::exception& e) {
        // nlohmann::json::type_error 등 get<float>()에서 발생 가능
        MLOG_WARN("Error parsing coordinates for key '%s': %s. Returning (0,0).", point_array_key.c_str(), e.what());
        return cv::Point2f{0.0f, 0.0f};
    } catch (const std::exception& e) {
        MLOG_ERROR("Unexpected std::exception parsing coordinates for key '%s': %s. Returning (0,0).", point_array_key.c_str(), e.what());
        return cv::Point2f{0.0f, 0.0f};
    }
}

json HomographyCalculator::homographyMatrixToJson(const cv::Mat& matrix) {
    // 행렬 유효성 검사 (타입: CV_64F, 크기: 3x3)
    if (matrix.empty() || matrix.rows != 3 || matrix.cols != 3 || matrix.type() != CV_64F) {
        MLOG_WARN("Invalid or empty matrix provided to homographyMatrixToJson. Matrix type: %d, dims: %d, rows: %d, cols: %d",
                  matrix.type(), matrix.dims, matrix.rows, matrix.cols);
        return json::array(); // 빈 JSON 배열 반환
    }

    json json_matrix = json::array(); // 2차원 배열로 표현
    for (int i = 0; i < matrix.rows; ++i) {
        json row_array = json::array();
        for (int j = 0; j < matrix.cols; ++j) {
            row_array.push_back(matrix.at<double>(i, j)); // double 타입으로 접근
        }
        json_matrix.push_back(row_array);
    }
    return json_matrix;
}

json HomographyCalculator::calculateWithProvidedData(const nlohmann::json& calibration_config_json,
                                                   const nlohmann::json& survey_data_json_root) {
    json result_json; // 최종 반환될 JSON 객체
    result_json["success"] = false; // 기본적으로 실패로 설정

    // 1. Calibrator 객체 생성 및 유효성 검사
    // Calibrator 생성자는 내부적으로 CheckJsonValidation을 호출할 것으로 예상됨 (사용자 제공 코드 기반)
    // calibration_config_json 자체가 Calibrator가 기대하는 최상위 JSON 구조여야 합니다.
    // (예: { "CalibrationInfo": { "fx": ..., ... } })
    if (!MGEN::MVEM::Calibrator::CheckJsonValidation(calibration_config_json)) {
        result_json["error"] = "Provided calibration_config JSON is invalid according to Calibrator::CheckJsonValidation.";
        MLOG_ERROR("Static validation of provided calibration_config_json failed.");
        return result_json;
    }

    MGEN::MVEM::Calibrator calibrator(calibration_config_json);
    if (!calibrator.isValid()) { // Calibrator 인스턴스 생성 후 유효성 재확인
        result_json["error"] = "Calibrator instance is invalid after construction with provided calibration data.";
        MLOG_ERROR("Calibrator instance is invalid. Provided calibration_config_json: %s", calibration_config_json.dump(2).c_str());
        return result_json;
    }
    MLOG_INFO("Calibrator created successfully from provided JSON data.");

    // 2. 서베이 데이터 파싱
    // survey_data_json_root 객체에서 실제 포인트 배열을 포함하는 키(예: "data")를 확인
    if (!survey_data_json_root.contains(SURVEY_POINTS_ARRAY_KEY_IN_SURVEY_DATA) ||
        !survey_data_json_root.at(SURVEY_POINTS_ARRAY_KEY_IN_SURVEY_DATA).is_array()) {
        result_json["error"] = std::string("Survey data JSON must contain a '") + SURVEY_POINTS_ARRAY_KEY_IN_SURVEY_DATA + std::string("' array.");
        MLOG_ERROR("Survey data JSON does not contain '%s' key or it's not an array. survey_data_json_root: %s",
                   SURVEY_POINTS_ARRAY_KEY_IN_SURVEY_DATA, survey_data_json_root.dump(2).c_str());
        return result_json;
    }
    const auto& survey_points_array = survey_data_json_root.at(SURVEY_POINTS_ARRAY_KEY_IN_SURVEY_DATA);

    std::vector<cv::Point2f> camera_points_for_homography; // 왜곡 보정된 카메라 좌표 (호모그래피 입력용)
    std::vector<cv::Point2f> ground_points_for_homography; // 해당 지상 좌표 (호모그래피 입력용)

    MLOG_INFO("Processing %d survey point objects from provided survey_data JSON.", survey_points_array.size());
    for (const auto& survey_obj : survey_points_array) {
        if (!survey_obj.is_object()) {
            MLOG_WARN("Skipping an item in survey points array as it's not a JSON object.");
            continue;
        }

        // 각 서베이 객체에서 카메라 좌표와 지상 좌표를 파싱
        cv::Point2f raw_camera_point = getCoordFromJsonArray(survey_obj, CAMERA_COORDS_ARRAY_KEY_IN_POINT_OBJECT);
        cv::Point2f ground_point     = getCoordFromJsonArray(survey_obj, GROUND_COORDS_ARRAY_KEY_IN_POINT_OBJECT);

        // Calibrator를 사용하여 카메라 좌표의 왜곡 보정
        std::optional<cv::Point2f> calibrated_camera_point_opt = calibrator.Calibrate(raw_camera_point);

        if (calibrated_camera_point_opt) {
            camera_points_for_homography.push_back(*calibrated_camera_point_opt);
            ground_points_for_homography.push_back(ground_point); // 보정 성공 시 대응하는 지상점 추가
            MLOG_DEBUG("Raw cam pt: (%.2f, %.2f) -> Calibrated: (%.2f, %.2f), Ground pt: (%.2f, %.2f)",
                       raw_camera_point.x, raw_camera_point.y,
                       calibrated_camera_point_opt->x, calibrated_camera_point_opt->y,
                       ground_point.x, ground_point.y);
        } else {
            MLOG_WARN("Calibration failed for camera point (%.2f, %.2f). This point pair will be excluded from homography calculation.",
                      raw_camera_point.x, raw_camera_point.y);
        }
    }

    // 호모그래피 계산을 위한 최소 포인트 수 확인 (보통 4개 이상)
    if (camera_points_for_homography.size() < 4) {
        result_json["error"] = "Not enough valid and calibratable point pairs to calculate homography (minimum 4 required).";
        MLOG_ERROR("Insufficient points for homography calculation. Successfully calibrated pairs: %d. Total survey objects: %d",
                   camera_points_for_homography.size(), survey_points_array.size());
        result_json["points_summary"] = {
            {"total_survey_point_objects", survey_points_array.size()},
            {"successfully_calibrated_and_paired_points", camera_points_for_homography.size()}
        };
        return result_json;
    }

    // 3. 호모그래피 행렬 계산
    // cv::findHomography는 입력 포인트가 float 타입이어야 함 (cv::Point2f)
    MLOG_INFO("Calculating homography with %d point pairs.", camera_points_for_homography.size());
    cv::Mat homography_matrix = cv::findHomography(camera_points_for_homography, ground_points_for_homography, cv::RANSAC);

    if (homography_matrix.empty()) {
        result_json["error"] = "Failed to calculate homography matrix (cv::findHomography returned an empty matrix).";
        MLOG_ERROR("cv::findHomography returned an empty matrix. Input points count: %d", camera_points_for_homography.size());
        return result_json;
    }
    MLOG_INFO("Homography matrix calculated successfully.");

    // 4. 결과 JSON 구성
    result_json["success"] = true;
    result_json["homography_matrix"] = homographyMatrixToJson(homography_matrix); // 변환 함수 사용
    result_json["points_used_for_homography"] = camera_points_for_homography.size();

    return result_json;
}
