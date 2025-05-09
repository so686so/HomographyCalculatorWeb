#include "Calibrator.h"
#include "MgenLogger.h"

// JSON
#include "json/json.hpp"

// STL::C++
#include <vector>
#include <string>

namespace MGEN::MVEM // Multi-View Event Mapper
{
    // 비교 등에 사용될 내부 Epsilon 값
    const double Calibrator::CALIBRATE_INTERNAL_EPSILON = std::numeric_limits<double>::epsilon() * 100.0;

    // JSON parsing key value
    constexpr auto CALIBRATION_SETTING_KEY = "CalibrationInfo";

    //--------------------------------------------------------------------------
    // 함수: CheckJsonValidation
    // 설명: 주어진 JSON 객체가 Calibrator 초기화에 필요한 유효한 구조와 값을
    //       가지고 있는지 정적으로 검사합니다. (키 존재, 숫자 타입, fx/fy != 0 확인)
    //       noexcept를 보장하기 위해 내부에서 json 예외를 catch 합니다.
    //--------------------------------------------------------------------------
    bool Calibrator::CheckJsonValidation( const nlohmann::json& js ) noexcept
    {
        try {
            // 1. JSON 객체가 비어있거나 최상위 키가 없는지 확인
            if( js.empty() || js.contains( CALIBRATION_SETTING_KEY ) == false ) {
                MLOG_WARN("CheckJsonValidation: JSON is empty or missing key '%s'", CALIBRATION_SETTING_KEY);
                return false;
            }

            // 2. 내부 캘리브레이션 정보 객체 접근
            const auto& cinfo = js.at(CALIBRATION_SETTING_KEY); // at() 사용 (키 없으면 예외 발생)

            // 3. 필수 키 리스트 정의
            const std::vector<std::string> key_list = {
                "fx", "fy", "cx", "cy", "skew", "k1", "k2", "k3", "p1", "p2"
            };

            // 비교에 사용할 작은 값 (epsilon) 정의
            const double epsilon = Calibrator::CALIBRATE_INTERNAL_EPSILON; // 클래스에 정의된 값 사용

            // 4. 모든 필수 키에 대해 검사 반복
            for( const std::string& key_name : key_list ) {
                // 4.1. 키 존재 여부 확인
                if( cinfo.contains( key_name ) == false ) {
                    MLOG_WARN("CheckJsonValidation: Missing key '%s'", key_name.c_str());
                    return false;
                }

                const auto& value_node = cinfo.at(key_name); // at() 사용 (키 없으면 예외 발생)

                // 4.2. 숫자 타입 여부 확인
                if( value_node.is_number() == false ){
                    MLOG_WARN("CheckJsonValidation: Key '%s' is not a number.", key_name.c_str());
                    return false;
                }

                // 4.3. fx, fy 값 유효성(0 아님) 확인
                if( key_name == "fx" || key_name == "fy" ){
                    double value = value_node.get<double>(); // 숫자 타입이므로 get<double> 가능
                    // 값이 0에 매우 가까운지 확인
                    if( std::fabs(value) < epsilon ){
                        MLOG_WARN("CheckJsonValidation: '%s' value (%.3e) is too close to zero.", key_name.c_str(), value);
                        return false; // 0에 가까우면 유효하지 않음
                    }
                }
            }
        }
        catch( const nlohmann::json::exception& e ){
            MLOG_ERROR("CheckJsonValidation exception: %s", e.what());
            return false;
        }
        // 모든 검사를 통과하면 true 반환
        return true;
    }

    //--------------------------------------------------------------------------
    // 함수: ParseJson
    // 설명: JSON 객체로부터 CalibratorParams 구조체를 파싱합니다.
    //       호출 전에 CheckJsonValidation이 통과되었다고 가정합니다.
    //       값 변환 오류 발생 시 기본값(0.0)을 가진 구조체를 반환할 수 있습니다.
    //       (noexcept 제거됨)
    //--------------------------------------------------------------------------
    CalibratorParams Calibrator::ParseJson( const nlohmann::json& js )
    {
        CalibratorParams res {}; // 결과 구조체 (0.0으로 초기화됨)

        // CheckJsonValidation이 외부(생성자)에서 호출된다고 가정.
        // 만약 여기서도 안전하게 하려면 js 및 cinfo 접근 전에 contains 체크 필요.
        try {
            // 1. 내부 캘리브레이션 정보 객체 접근
            const auto& cinfo = js.at(CALIBRATION_SETTING_KEY);

            // 2. 각 키에 해당하는 값을 읽어와 파라미터 구조체에 설정
            //    value() 함수는 키가 없거나 타입 변환 실패 시 기본값(0.0) 사용
            //    단, 호환 불가능한 타입(객체/배열 등)이면 예외 발생 가능
            res.fx   = cinfo.value( "fx",   0.0 ); // double 리터럴 0.0 사용
            res.fy   = cinfo.value( "fy",   0.0 );
            res.cx   = cinfo.value( "cx",   0.0 );
            res.cy   = cinfo.value( "cy",   0.0 );
            res.skew = cinfo.value( "skew", 0.0 );
            res.k1   = cinfo.value( "k1",   0.0 );
            res.k2   = cinfo.value( "k2",   0.0 );
            res.k3   = cinfo.value( "k3",   0.0 );
            res.p1   = cinfo.value( "p1",   0.0 );
            res.p2   = cinfo.value( "p2",   0.0 );

        } catch (const nlohmann::json::exception& e) {
            // 오류 시 기본값(0.0)으로 채워진 res 반환
            MLOG_ERROR("JSON parsing error in Calibrator::ParseJson: %s", e.what());
            return CalibratorParams {};
        }
        return res; // 파싱된 결과 반환
    }

    //--------------------------------------------------------------------------
    // 생성자: Calibrator
    // 설명: JSON 객체를 받아 유효성을 검사하고, 유효하다면 파라미터를 파싱하여
    //       멤버 변수 c_info와 is_valid를 초기화합니다.
    //       (유효성 검사 중복 호출 최적화 적용)
    //--------------------------------------------------------------------------
    Calibrator::Calibrator( const nlohmann::json& js )
        : is_valid ( Calibrator::CheckJsonValidation( js ) )                       // 1. 유효성 검사 결과를 먼저 저장
        , c_info   ( is_valid ? Calibrator::ParseJson( js ) : CalibratorParams{} ) // 2. 유효할 때만 파싱, 아니면 기본값 사용
    {
        // 생성자 본문에서는 추가 작업 없음
        // 만약 ParseJson에서 예외 발생 가능성을 엄격히 처리하려면 여기서 try-catch 고려 가능
        // try {
        //     c_info = is_valid ? Calibrator::ParseJson( js ) : CalibratorParams{};
        // } catch (...) {
        //     is_valid = false; // 예외 발생 시 유효하지 않음으로 처리
        //     c_info = {}; // 기본값으로 설정
        //     // 로그 기록 등 추가 처리
        // }
    }

    //--------------------------------------------------------------------------
    // 함수: Normalize
    // 설명: 입력 픽셀 좌표를 정규화된 이미지 평면 좌표로 변환합니다.
    //       객체가 유효하지 않으면(isValid() == false) 입력값을 그대로 반환합니다.
    //--------------------------------------------------------------------------
    cv::Point2f Calibrator::Normalize( const cv::Point2f& pt ) const
    {
        // 1. 객체 유효성 검사 (fx, fy 0 포함)
        if( !this->isValid() ){
            MLOG_WARN("Calibrator::Normalize called on invalid object. Returning input point.");
            return pt; // 유효하지 않으면 입력값 반환
        }

        // 2. 정규화 계산 수행 (fx, fy가 0 아님을 보장받음)
        cv::Point2f normalized_pt {};
        // y 먼저 계산 (skew 계산에 사용됨)
        normalized_pt.y = ( pt.y - c_info.cy ) / c_info.fy;
        // x 계산 (skew 보정 포함)
        normalized_pt.x = ( pt.x - c_info.cx ) / c_info.fx - c_info.skew * normalized_pt.y;

        return normalized_pt;
    }

    //--------------------------------------------------------------------------
    // 함수: DeNormalize
    // 설명: 정규화된 이미지 평면 좌표를 픽셀 좌표로 변환합니다. (Normalize 역연산)
    //       객체가 유효하지 않으면(isValid() == false) 입력값을 그대로 반환합니다.
    //--------------------------------------------------------------------------
    cv::Point2f Calibrator::DeNormalize( const cv::Point2f& pt ) const
    {
        // 1. 객체 유효성 검사
        if( !this->isValid() ){
            MLOG_WARN("Calibrator::DeNormalize called on invalid object. Returning input point.");
            return pt; // 유효하지 않으면 입력값 반환
        }

        // 2. 역정규화 계산 수행
        cv::Point2f denormalized_pt {};
        denormalized_pt.x = c_info.fx * ( pt.x + c_info.skew * pt.y ) + c_info.cx;
        denormalized_pt.y = c_info.fy * pt.y + c_info.cy;

        return denormalized_pt;
    }

    //--------------------------------------------------------------------------
    // 함수: DistortNormal (이전 DistortNomal 오타 수정)
    // 설명: 정규화된 (왜곡되지 않은) 이미지 좌표에 왜곡 모델(방사, 접선)을 적용하여
    //       왜곡된 정규화 이미지 좌표를 계산합니다.
    //       객체가 유효하지 않으면(isValid() == false) 입력값을 그대로 반환합니다.
    //--------------------------------------------------------------------------
    cv::Point2f Calibrator::DistortNormal( const cv::Point2f& pt ) const
    {
         // 1. 객체 유효성 검사
        if( !this->isValid() ){
            MLOG_WARN("Calibrator::DistortNormal called on invalid object. Returning input point.");
            return pt; // 유효하지 않으면 입력값 반환
        }

        // 2. 왜곡 계산 준비
        const double x = pt.x; // 정규화된 좌표 (왜곡 없음 가정)
        const double y = pt.y;
        const double r2 = (x * x) + (y * y); // r^2 계산
        const double r4 = r2 * r2;           // r^4 계산
        const double r6 = r4 * r2;           // r^6 계산

        // 3. 방사 왜곡 계수 계산 (k1, k2, k3 사용)
        const double radial_distortion_factor = 1.0 + ( c_info.k1 * r2 ) + ( c_info.k2 * r4 ) + ( c_info.k3 * r6 );

        // 4. 접선 왜곡 계산 (p1, p2 사용)
        const double tangential_distortion_x = ( 2.0 * c_info.p1 * x * y ) + ( c_info.p2 * ( r2 + ( 2.0 * x * x ) ) );
        const double tangential_distortion_y = ( c_info.p1 * ( r2 + ( 2.0 * y * y ) ) ) + ( 2.0 * c_info.p2 * x * y );

        // 5. 왜곡 적용된 좌표 계산
        cv::Point2f distorted_n_pt {};
        distorted_n_pt.x = (radial_distortion_factor * x) + tangential_distortion_x;
        distorted_n_pt.y = (radial_distortion_factor * y) + tangential_distortion_y;

        return distorted_n_pt;
    }

    //--------------------------------------------------------------------------
    // 함수: Calibrate
    // 설명: 입력된 픽셀 좌표(pt)의 왜곡을 보정하여 실제 픽셀 좌표를 반환합니다.
    //       내부적으로 Normalize -> Iterative Undistortion -> DeNormalize 과정을 거칩니다.
    //       객체가 유효하지 않으면 입력값(pt)을 그대로 반환합니다.
    //--------------------------------------------------------------------------
    std::optional<cv::Point2f> Calibrator::Calibrate( const cv::Point2f& pt, const cv::Point2f& err_threshold ) const
    {
        // 1. 객체 유효성 검사 (fx, fy 0 포함)
        if( is_valid == false ) {
            // MLOG_WARN("Calibrator::Calibrate called on invalid object. Returning input point.");
            return std::nullopt; // 유효하지 않으면 nullopt
        }

        // 2. 입력 픽셀 좌표(pt)를 정규화된 이미지 좌표(p_n_d)로 변환
        // p_n_d 는 왜곡이 적용된 상태의 정규화된 좌표임
        cv::Point2f p_n_d = this->Normalize( pt );

        // 3. 왜곡 보정된 정규화 좌표(crrct)를 찾기 위한 반복 계산 시작
        // 초기 추정값: 왜곡된 좌표 p_n_d 를 왜곡 안 된 좌표의 초기값으로 사용
        cv::Point2f crrct     = p_n_d;
        bool        converged = false; // 수렴 성공 여부 플래그

        // 최대 반복 횟수 설정 (무한 루프 방지)
        int try_count = 100; // 이전 10000은 과도할 수 있음, 100 정도도 충분한 경우가 많음 (조정 가능)
        while( try_count-- > 0 )
        {
            // 현재 추정값(crrct)을 왜곡 모델에 넣어 예상되는 왜곡 좌표 계산
            cv::Point2f distorted_estimate = this->DistortNormal( crrct );

            // 목표 왜곡 좌표(p_n_d)와의 차이(err) 계산
            cv::Point2f err = distorted_estimate - p_n_d;

            // 오차(err)를 이용하여 현재 추정값(crrct) 보정 (단순 반복법)
            crrct = crrct - err; // 왜곡된 결과가 목표보다 크면 추정값을 줄이고, 작으면 늘림

            // 보정된 오차(err)가 임계값(err_threshold)보다 작아지면 반복 종료 (절대값 비교!)
            if( std::fabs(err.x) < err_threshold.x && std::fabs(err.y) < err_threshold.y ) {
                converged = true; // 수렴 성공 플래그 설정
                break; // 수렴 완료
            }
        }
        // 4. 수렴 결과 확인 및 최종 값 반환
        if( converged ){
            // 수렴 성공 시: 최종 추정값(crrct)을 역정규화하여 반환 (optional로 감싸서)
            return this->DeNormalize( crrct );
        }
        else {
            // 수렴 실패 시 (최대 반복 횟수 초과)
            MLOG_WARN("Calibrator::Calibrate reached max iterations without converging for input (%.2f, %.2f).", pt.x, pt.y);
            return std::nullopt; // 빈 optional 반환하여 실패 알림
        }
    }

} // nsp::MGEN::MVEM