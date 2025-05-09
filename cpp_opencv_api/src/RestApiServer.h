// cpp_opencv_api/src/RestApiServer.h

#pragma once

#include "httplib.h"              // C++ HTTP/HTTPS 서버 라이브러리
#include "HomographyCalculator.h" // 위에서 정의한 호모그래피 계산 클래스
#include <string>
#include <memory>                 // std::shared_ptr, std::enable_shared_from_this
#include <thread>                 // std::thread
#include <atomic>                 // std::atomic

// C++ API 서비스가 내부적으로 리슨할 기본 포트 번호
// 이 포트는 docker-compose.yml의 cpp_api_service.ports의 컨테이너 측 포트 및
// node_app의 CPP_API_URL 환경 변수, cpp_api_service의 healthcheck URL과 일치해야 합니다.
constexpr int CPP_API_INTERNAL_DEFAULT_PORT = 3004; // 사용자 요청에 따라 3004로 설정

/**
 * @brief httplib를 사용하여 RESTful API를 제공하는 서버 클래스입니다.
 * 주로 HomographyCalculator를 사용하여 호모그래피 계산 요청을 처리합니다.
 */
class RestApiServer : public std::enable_shared_from_this<RestApiServer> {
public:
    /**
     * @brief RestApiServer 생성자입니다.
     *
     * @param calculator HomographyCalculator의 shared_ptr. 서버는 이 객체를 사용하여
     * 호모그래피 계산 요청을 처리합니다. null이면 내부에서 기본 생성합니다.
     * @param address    서버가 리슨할 IP 주소 (기본값: "0.0.0.0" - 모든 인터페이스).
     * @param port       서버가 리슨할 포트 번호 (기본값: CPP_API_INTERNAL_DEFAULT_PORT).
     */
    RestApiServer(std::shared_ptr<HomographyCalculator> calculator,
                  const std::string& address = "0.0.0.0",
                  int port = CPP_API_INTERNAL_DEFAULT_PORT);

    /**
     * @brief RestApiServer 소멸자입니다.
     * 서버가 실행 중이면 자동으로 stop()을 호출하여 정리합니다.
     */
    ~RestApiServer();

    // 객체의 복사 및 이동을 방지합니다.
    RestApiServer(const RestApiServer&) = delete;
    RestApiServer& operator=(const RestApiServer&) = delete;
    RestApiServer(RestApiServer&&) = delete;
    RestApiServer& operator=(RestApiServer&&) = delete;

    /**
     * @brief API 서버를 비동기적으로 시작합니다.
     * 새 스레드에서 HTTP 요청을 리슨하기 시작합니다.
     * 서버가 성공적으로 리스닝을 시작하면 반환되고, 실패 시 예외를 발생시킬 수 있습니다.
     * @throw std::runtime_error 서버 시작에 실패한 경우.
     */
    void start();

    /**
     * @brief 실행 중인 API 서버를 중지합니다.
     * 리스닝 스레드를 안전하게 종료하고 관련 리소스를 정리합니다.
     */
    void stop();

    /**
     * @brief 서버가 현재 실행 중(리스닝 중)인지 확인합니다.
     * @return 서버가 실행 중이면 true, 그렇지 않으면 false.
     */
    bool is_server_running() const { return is_running_.load(); }

private:
    /**
     * @brief 서버의 API 라우트(엔드포인트)를 설정합니다.
     * 이 함수는 서버 시작 시 내부적으로 호출됩니다.
     */
    void setup_routes();

    httplib::Server svr_; // httplib 서버 인스턴스
    std::string address_; // 리슨할 주소
    int port_;            // 리슨할 포트
    std::thread server_thread_; // 서버 리스닝을 위한 별도 스레드
    std::atomic<bool> is_running_{false}; // 서버 실행 상태 플래그

    std::shared_ptr<HomographyCalculator> homography_calculator_; // 호모그래피 계산 로직 처리기
};
