#ifndef _MGEN_MVEM_CALIBRATOR_H_
#define _MGEN_MVEM_CALIBRATOR_H_

/* ====================================
 * Camera Calibration Parameter Loading and Undistortion Class Header
 * ------------------------------------
 * Author : So Byung Jun / Gemini AI
 * Update : 2025-04-25 (Revised based on review)
 * Desc   : JSON으로부터 카메라 내부 파라미터 및 왜곡 계수를 로드하고,
 * 입력된 2D 포인트의 왜곡을 보정하는 기능을 제공합니다.
 * ==================================== */

// JSON Forward Declaration (헤더 파일에서는 전방 선언 사용 권장)
#include "json/json_fwd.hpp" // nlohmann::json 전방 선언

// OpenCV Core Types (전체 opencv.hpp 대신 필요한 타입만 포함)
#include <opencv2/core/types.hpp> // cv::Point2f 사용

// STL
#include <limits> // std::numeric_limits
#include <optional>

namespace MGEN::MVEM // Multi-View Event Mapper
{
    /**
     * @brief 카메라 캘리브레이션 파라미터를 저장하는 구조체.
     * 모든 값은 double 타입으로 저장됩니다.
     */
    struct CalibratorParams
    {
        // 카메라 내부 파라미터 (Intrinsic Parameters)
        double fx   = 0.0; /**< 초점 거리 (x축) */
        double fy   = 0.0; /**< 초점 거리 (y축) */
        double cx   = 0.0; /**< 주점 (principal point) x 좌표 */
        double cy   = 0.0; /**< 주점 (principal point) y 좌표 */
        double skew = 0.0; /**< 비대칭 계수 (skew coefficient) */

        // 왜곡 계수 (Distortion Coefficients)
        // 방사 왜곡 (Radial Distortion)
        double k1   = 0.0; /**< 방사 왜곡 계수 k1 */
        double k2   = 0.0; /**< 방사 왜곡 계수 k2 */
        double k3   = 0.0; /**< 방사 왜곡 계수 k3 */
        // 접선 왜곡 (Tangential Distortion)
        double p1   = 0.0; /**< 접선 왜곡 계수 p1 */
        double p2   = 0.0; /**< 접선 왜곡 계수 p2 */
    };

    /**
     * @brief JSON 설정 파일로부터 카메라 파라미터를 로드하여
     * 2D 포인트의 왜곡 보정(undistortion)을 수행하는 클래스.
     * 생성 시 JSON 유효성을 검사하며, isValid() 메소드를 통해
     * 객체가 유효한 파라미터로 초기화되었는지 확인할 수 있습니다.
     */
    class Calibrator
    {
    public:
        /** 기본 생성자 삭제: 반드시 JSON 객체로 초기화해야 함 */
        Calibrator() = delete;

        /**
         * @brief nlohmann::json 객체로부터 Calibrator를 생성합니다.
         * 내부적으로 JSON 유효성을 검사하고 파라미터를 파싱하여 저장합니다.
         * @param json 카메라 파라미터가 포함된 nlohmann::json 객체.
         */
        explicit Calibrator( const nlohmann::json& json );

        /** 기본 소멸자 */
        ~Calibrator() = default;

        /**
         * @brief 입력된 2D 포인트의 왜곡을 보정합니다 (Undistortion).
         * 내부적으로 반복적인 방법을 사용하여 왜곡 제거 좌표를 계산합니다.
         * @param point 왜곡된 픽셀 좌표 (cv::Point2f).
         * @param err_threshold 반복 계산 종료를 위한 오차 임계값 (x, y 각각). 양수 값이어야 함.
         * @return 왜곡 보정에 성공하면 보정된 픽셀 좌표(cv::Point2f)를 포함하는 std::optional 객체.
         * 객체가 유효하지 않거나 계산이 수렴하지 않으면 std::nullopt 반환.
         */
        std::optional<cv::Point2f> Calibrate( const cv::Point2f& point, const cv::Point2f& err_threshold = { 1e-7, 1e-7 } ) const;

        /**
         * @brief Calibrator 객체가 유효한 보정 파라미터로 초기화되었는지 확인합니다.
         * 생성 시 CheckJsonValidation 결과 (키 존재, 타입, fx/fy 0 검사 포함)를 반환합니다.
         * Calibrate 함수 등을 호출하기 전에 이 함수로 유효성을 확인해야 합니다.
         * @return 파라미터가 유효하면 true, 그렇지 않으면 false.
         */
        bool isValid() const noexcept { return is_valid; }

        /**
         * @brief 주어진 nlohmann::json 객체가 Calibrator 초기화에 필요한
         * 유효한 구조와 값을 가지고 있는지 정적으로 검사합니다.
         * 키 존재 여부, 숫자 타입 여부, fx/fy가 0에 가까운지 여부를 확인합니다.
         * @param json 검사할 nlohmann::json 객체.
         * @return 유효하면 true, 그렇지 않으면 false.
         */
        static bool CheckJsonValidation( const nlohmann::json& json ) noexcept;

    private:
        /**
         * @brief 유효성이 검증된 nlohmann::json 객체로부터 CalibratorParams를 파싱합니다.
         * 주의: 이 함수는 호출 전에 CheckJsonValidation이 true를 반환했음을 가정합니다.
         * 내부적으로 값 타입 오류 발생 시 기본값을 가지는 CalibratorParams를 반환할 수 있습니다.
         * @param json 파싱할 nlohmann::json 객체 (유효성 검사 통과 가정).
         * @return 파싱된 CalibratorParams 구조체.
         */
        static CalibratorParams ParseJson( const nlohmann::json& json );

        /**
         * @brief 입력 픽셀 좌표를 정규화된 이미지 평면 좌표로 변환합니다.
         * (카메라 내부 파라미터 역 적용: 주점 이동, 초점 거리 나누기, 비대칭 보정)
         * @param point 픽셀 좌표 (cv::Point2f).
         * @return 정규화된 이미지 좌표 (cv::Point2f). 객체가 유효하지 않으면 입력값 반환.
         */
        cv::Point2f Normalize( const cv::Point2f& point ) const;

        /**
         * @brief 정규화된 이미지 평면 좌표를 픽셀 좌표로 변환합니다. (Normalize의 역연산)
         * (카메라 내부 파라미터 적용: 비대칭 고려, 초점 거리 곱하기, 주점 이동)
         * @param point 정규화된 이미지 좌표 (cv::Point2f).
         * @return 픽셀 좌표 (cv::Point2f). 객체가 유효하지 않으면 입력값 반환.
         */
        cv::Point2f DeNormalize( const cv::Point2f& point ) const;

        /**
         * @brief 정규화된 (왜곡되지 않은) 이미지 좌표에 왜곡 모델을 적용하여
         * 왜곡된 정규화 이미지 좌표를 계산합니다. (함수 이름 오타 수정)
         * @param point 정규화된 이미지 좌표 (왜곡 없음 가정) (cv::Point2f).
         * @return 왜곡이 적용된 정규화 이미지 좌표 (cv::Point2f). 객체가 유효하지 않으면 입력값 반환.
         */
        cv::Point2f DistortNormal( const cv::Point2f& point ) const;

    private:
        // 생성 시 JSON 유효성 검사 결과 (fx/fy 0 포함) (생성 후 불변)
        const bool is_valid;
        // 로드된 카메라 캘리브레이션 파라미터 (생성 후 불변)
        const CalibratorParams c_info;

    public:
        // 비교 등에 사용될 내부 Epsilon 값
        static const double CALIBRATE_INTERNAL_EPSILON;
    }; // cls::Calibrator

} // nsp::MGEN::MVEM

#endif // _MGEN_MVEM_CALIBRATOR_H_