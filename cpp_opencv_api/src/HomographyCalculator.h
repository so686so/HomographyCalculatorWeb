// cpp_opencv_api/src/HomographyCalculator.h

#pragma once

#include "Calibrator.h"      // 사용자 제공: MGEN::MVEM::Calibrator
#include "json/json.hpp"     // nlohmann/json 라이브러리
#include <opencv2/opencv.hpp> // OpenCV (cv::Mat, cv::findHomography 등)
#include <string>
#include <vector>
#include <optional> // std::optional (Calibrator.Calibrate 반환 타입)

// nlohmann::json 사용을 위한 별칭
using json = nlohmann::json;

/**
 * @brief 호모그래피 계산 관련 로직을 캡슐화하는 클래스입니다.
 * 주로 POST 요청으로 전달받은 JSON 데이터를 사용하여 호모그래피 행렬을 계산합니다.
 */
class HomographyCalculator {
public:
    /**
     * @brief HomographyCalculator의 기본 생성자입니다.
     * 필요한 초기화 작업이 있다면 여기에 추가할 수 있습니다.
     */
    HomographyCalculator();

    /**
     * @brief HomographyCalculator의 기본 소멸자입니다.
     */
    ~HomographyCalculator() = default;

    // 복사 및 이동 생성자/대입 연산자 삭제 (필요에 따라 구현 가능)
    HomographyCalculator(const HomographyCalculator&) = delete;
    HomographyCalculator& operator=(const HomographyCalculator&) = delete;
    HomographyCalculator(HomographyCalculator&&) = delete;
    HomographyCalculator& operator=(HomographyCalculator&&) = delete;

    /**
     * @brief 외부(POST 요청 등)로부터 직접 제공된 JSON 데이터를 사용하여 호모그래피를 계산합니다.
     *
     * @param calibration_config_json Calibrator 객체 생성에 필요한 카메라 보정 정보가 담긴 JSON 객체입니다.
     * 이 JSON 객체는 MGEN::MVEM::Calibrator 클래스가 기대하는
     * "CalibrationInfo" 키와 그 하위 구조를 포함해야 합니다.
     * @param survey_data_json        서베이 포인트 데이터(카메라 좌표, 지상 좌표 쌍)를 포함하는 JSON 객체입니다.
     * 일반적으로 "data"라는 키 아래에 각 포인트 쌍을 나타내는 객체 배열이 있을 것으로 예상합니다.
     * 각 포인트 객체는 카메라 좌표와 지상 좌표를 포함해야 합니다. (예: "camera_coords": [x,y], "ground_coords": [x,y])
     *
     * @return 계산 결과를 담은 JSON 객체를 반환합니다.
     * 성공 시: {"success": true, "homography_matrix": [[h11,h12,h13],[h21,h22,h23],[h31,h32,h33]], "points_used_for_homography": N}
     * 실패 시: {"success": false, "error": "에러 메시지"}
     */
    json calculateWithProvidedData(const nlohmann::json& calibration_config_json,
                                   const nlohmann::json& survey_data_json);

private:
    /**
     * @brief JSON 객체 내의 특정 키가 가리키는 배열로부터 cv::Point2f 좌표를 파싱합니다.
     * 좌표는 배열의 지정된 인덱스에서 x, y 순서로 읽어옵니다.
     *
     * @param object          좌표 데이터를 포함하는 JSON 객체 (예: 하나의 서베이 포인트 객체).
     * @param point_array_key 좌표 값 배열(예: [x, y])을 값으로 가지는 JSON 키 이름.
     * @param index_x         배열 내에서 x 좌표 값의 인덱스 (기본값: 0).
     * @param index_y         배열 내에서 y 좌표 값의 인덱스 (기본값: 1).
     *
     * @return 파싱된 cv::Point2f 객체. 키가 없거나, 배열이 아니거나, 요소가 부족하거나,
     * 타입 변환 실패 시 (0.0f, 0.0f)를 반환하고 경고 로그를 남깁니다.
     */
    cv::Point2f getCoordFromJsonArray(const nlohmann::json& object,
                                     const std::string& point_array_key,
                                     size_t index_x = 0,
                                     size_t index_y = 1);

    /**
     * @brief cv::Mat 형태의 호모그래피 행렬을 nlohmann::json 객체 (2차원 배열)로 변환합니다.
     * 행렬은 double 타입(CV_64F)의 3x3 크기여야 합니다.
     *
     * @param matrix 변환할 cv::Mat 객체 (호모그래피 행렬).
     *
     * @return 호모그래피 행렬의 JSON 배열 표현.
     * 입력 행렬이 유효하지 않거나 비어있으면 빈 JSON 배열을 반환합니다.
     */
    json homographyMatrixToJson(const cv::Mat& matrix);
};
