// cpp_opencv_api/src/main.cpp

#include "RestApiServer.h"        // 우리가 정의한 API 서버 클래스
#include "HomographyCalculator.h" // 호모그래피 계산 클래스
#include "MgenLogger.h"           // 사용자 제공 로거

#include <iostream>               // 표준 입출력 (콘솔 로그 등)
#include <csignal>                // POSIX 시그널 처리 (SIGINT, SIGTERM)
#include <memory>                 // std::shared_ptr, std::make_shared
#include <stdexcept>              // std::runtime_error, std::exception
#include <chrono>                 // std::chrono::seconds (sleep 등)
#include <cstdlib>                // std::getenv (환경 변수 읽기 - 선택 사항)

// 전역으로 서버 인스턴스 포인터를 선언하여 시그널 핸들러에서 접근 가능하도록 함
// (더 나은 방법은 main 함수 내에서 제어하고, 시그널 핸들러는 atomic flag 등을 설정하여 main 루프가 종료되도록 유도하는 것)
std::shared_ptr<RestApiServer> global_api_server_instance = nullptr;

/**
 * @brief SIGINT (Ctrl+C) 또는 SIGTERM (kill) 같은 종료 시그널을 처리하는 함수입니다.
 * 서버 인스턴스가 존재하면 안전하게 중지하도록 요청합니다.
 * @param signum 수신된 시그널 번호.
 */
void signalHandler(int signum) {
    MLOG_WARN("Interrupt signal (%d) received. Attempting graceful shutdown...", signum);
    if (global_api_server_instance) {
        // 서버 중지를 요청합니다. stop() 함수는 내부적으로 스레드 종료를 기다립니다.
        global_api_server_instance->stop();
    } else {
        MLOG_WARN("Global API server instance is null, cannot stop it via signal handler. Exiting.");
        // 서버 인스턴스가 없다면, 그냥 종료될 수 있도록 합니다.
        // exit(signum); // 또는 그냥 main 루프가 끝나도록 둡니다.
    }
    // main 루프가 is_server_running()을 통해 종료를 감지하도록 하는 것이 더 좋습니다.
    // 여기서 직접 exit()를 호출하면 리소스 정리가 제대로 안 될 수 있습니다.
}

/**
 * @brief C++ 호모그래피 계산 API 서비스의 메인 진입점입니다.
 * 로거를 초기화하고, API 서버를 설정 및 시작한 후,
 * 종료 시그널을 받을 때까지 대기합니다.
 * @param argc 커맨드 라인 인자 개수.
 * @param argv 커맨드 라인 인자 배열. argv[1]은 선택적으로 포트 번호로 사용될 수 있습니다.
 * @return 정상 종료 시 0, 오류 발생 시 0이 아닌 값을 반환합니다.
 */
int main(int argc, char* argv[]) {
    // 1. MGEN 로거 초기화
    // 기본적으로 콘솔에 INFO 레벨 이상, 컬러로 출력하도록 설정합니다.
    MGEN::LoggerConfig logger_config;
    logger_config.setLogType(MGEN::LogType::Console)
                 .setPrefixUseColor(MGEN::LogPrefix::OnColor);

    // (선택 사항) 파일 로깅 설정 예시:
    // logger_config.setLogType(MGEN::LogType::File)
    //              .setLogSaveFile("./logs/cpp_api_service.log") // 로그 파일 경로
    //              .setReOpenIntervals(3600) // 1시간마다 파일 재오픈 (로그 로테이션 유사 효과)
    //              .setPrefixUseColor(MGEN::LogPrefix::OffColor); // 파일에는 색상 코드 없이

    MGEN::initLogger(logger_config); // 로거 싱글톤 초기화

    MLOG_INFO("======================================================");
    MLOG_INFO("  MGEN C++ Homography Calculation API Service v1.0  ");
    MLOG_INFO("  Starting up...                                    ");
    MLOG_INFO("======================================================");

    // 2. 종료 시그널(SIGINT, SIGTERM)에 대한 핸들러 등록
    signal(SIGINT, signalHandler);  // Ctrl+C 입력 시
    signal(SIGTERM, signalHandler); // 시스템 종료 요청 시 (e.g., kill command)

    try {
        // 3. HomographyCalculator 인스턴스 생성
        // 이 계산기는 HTTP 요청 처리 시 사용됩니다.
        auto homography_calc_ptr = std::make_shared<HomographyCalculator>();
        MLOG_INFO("HomographyCalculator instance created.");

        // 4. API 서버 리슨 포트 결정
        // 기본 포트는 RestApiServer.h에 정의된 CPP_API_INTERNAL_DEFAULT_PORT (3004)
        int server_listen_port = CPP_API_INTERNAL_DEFAULT_PORT;
        if (argc > 1) { // 프로그램 실행 시 첫 번째 인자로 포트 번호 지정 가능
            try {
                int port_from_arg = std::stoi(argv[1]);
                if (port_from_arg > 0 && port_from_arg <= 65535) {
                    server_listen_port = port_from_arg;
                    MLOG_INFO("Using port %d from command line argument.", server_listen_port);
                } else {
                    MLOG_WARN("Invalid port number '%d' from argument. Using default port %d.", port_from_arg, CPP_API_INTERNAL_DEFAULT_PORT);
                }
            } catch (const std::invalid_argument& ia) {
                MLOG_WARN("Invalid argument for port: '%s'. Not a number. Using default port %d.", argv[1], CPP_API_INTERNAL_DEFAULT_PORT);
            } catch (const std::out_of_range& oor) {
                MLOG_WARN("Port argument '%s' is out of range. Using default port %d.", argv[1], CPP_API_INTERNAL_DEFAULT_PORT);
            }
        }

        // 5. RestApiServer 인스턴스 생성 및 HomographyCalculator 주입
        // 서버는 "0.0.0.0" (모든 네트워크 인터페이스)에서 지정된 포트로 리슨합니다.
        global_api_server_instance = std::make_shared<RestApiServer>(homography_calc_ptr, "0.0.0.0", server_listen_port);
        MLOG_INFO("RestApiServer instance created. Target port: %d", server_listen_port);

        // 6. API 서버 시작
        MLOG_INFO("Attempting to start the API server...");
        global_api_server_instance->start(); // 이 함수는 서버가 리스닝을 시작하면 반환되거나, 실패 시 예외를 던짐.

        // 서버가 백그라운드 스레드에서 실행되는 동안, 메인 스레드는 여기서 대기합니다.
        // is_server_running()을 주기적으로 확인하여 서버 상태를 감지하고,
        // 시그널 핸들러가 서버를 중지시키면 이 루프도 종료됩니다.
        while (global_api_server_instance && global_api_server_instance->is_server_running()) {
            std::this_thread::sleep_for(std::chrono::seconds(1)); // 1초마다 상태 확인 (또는 더 긴 간격)
        }

        MLOG_INFO("Main loop determined server is no longer running.");

    } catch (const std::exception& e) {
        MLOG_ERROR("!!! CRITICAL ERROR during server setup or main execution loop: %s", e.what());
        // 서버 인스턴스가 생성되었고 아직 실행 중이라면 중지 시도
        if (global_api_server_instance && global_api_server_instance->is_server_running()) {
            MLOG_INFO("Attempting to stop server due to critical error...");
            global_api_server_instance->stop();
        }
        MLOG_INFO("Service will now exit due to critical error.");
        return 1; // 오류 상태로 종료
    } catch (...) {
        MLOG_ERROR("!!! UNKNOWN CRITICAL ERROR occurred during server setup or main execution loop.");
        if (global_api_server_instance && global_api_server_instance->is_server_running()) {
            global_api_server_instance->stop();
        }
        MLOG_INFO("Service will now exit due to unknown critical error.");
        return 2; // 다른 오류 상태로 종료
    }

    // global_api_server_instance->stop()이 signalHandler 또는 위 catch 블록에서 호출되었을 것임.
    // stop() 함수 내부에서 스레드 join을 처리하므로, 여기서 추가적인 join은 필요 없을 수 있음.
    // 만약 stop()이 호출되지 않은 경로로 여기까지 올 수 있다면 (예: is_server_running()이 false가 되는 다른 이유),
    // 여기서 명시적으로 stop()을 한번 더 호출하여 정리하는 것이 안전할 수 있음.
    if (global_api_server_instance) {
         MLOG_INFO("Ensuring server resources are released if instance still exists...");
         if (global_api_server_instance->is_server_running()){ // 만약 아직도 실행중이라면 (이론상으론 없어야 함)
            global_api_server_instance->stop();
         }
         global_api_server_instance.reset(); // shared_ptr 해제
    }

    MLOG_INFO("======================================================");
    MLOG_INFO("  C++ Homography API Service has shut down.         ");
    MLOG_INFO("======================================================");
    return 0; // 정상 종료
}
