// cpp_opencv_api/src/RestApiServer.cpp

#include "RestApiServer.h"
#include "MgenLogger.h"      // 사용자 제공 로거
#include "json/json.hpp"     // nlohmann/json

using json = nlohmann::json; // JSON 별칭

// POST 요청 본문에서 HomographyCalculator로 전달될 JSON 데이터의 최상위 키 이름들
// (HomographyCalculator.cpp의 정의와 일치해야 함)
constexpr auto CALIBRATION_CONFIG_KEY_IN_REQUEST_BODY = "calibration_config";
constexpr auto SURVEY_DATA_KEY_IN_REQUEST_BODY = "survey_data";

RestApiServer::RestApiServer(std::shared_ptr<HomographyCalculator> calculator, const std::string& address, int port)
    : homography_calculator_(calculator), address_(address), port_(port), is_running_(false) {
    if (!homography_calculator_) {
        MLOG_WARN("HomographyCalculator instance provided to RestApiServer is null. A default instance will be created.");
        homography_calculator_ = std::make_shared<HomographyCalculator>(); // 안전장치: null이면 기본 생성
    }
    MLOG_INFO("RestApiServer instance configured. Address: %s, Port: %d", address_.c_str(), port_);
}

RestApiServer::~RestApiServer() {
    MLOG_INFO("RestApiServer destructor called. Ensuring server is stopped.");
    stop(); // 소멸 시 서버가 실행 중이면 중지
}

void RestApiServer::start() {
    if (is_running_.load()) {
        MLOG_WARN("RestApiServer is already running on port %d. Start request ignored.", port_);
        return;
    }

    // 서버 리스닝을 위한 새 스레드 생성
    server_thread_ = std::thread([this]() { // this 포인터를 캡처하여 멤버 접근
        try {
            this->setup_routes(); // API 라우트 설정

            MLOG_INFO("Attempting to bind API server to %s:%d...", this->address_.c_str(), this->port_);
            if (!svr_.bind_to_port(this->address_.c_str(), this->port_)) {
                MLOG_ERROR("Failed to bind API server to port %d. Address: %s.", this->port_, this->address_.c_str());
                this->is_running_.store(false); // 바인딩 실패 시 실행 상태 false로 명시
                return; // 스레드 종료
            }
            MLOG_INFO("API server bound successfully to %s:%d. Starting listener thread...", this->address_.c_str(), this->port_);

            // listen_after_bind() 호출 직전에 is_running_을 true로 설정 (listen은 블로킹 호출)
            this->is_running_.store(true);
            svr_.listen_after_bind(); // HTTP 요청 리스닝 시작 (블로킹)

            // svr_.listen_after_bind()가 반환되면 서버가 중지된 것임 (일반적으로 svr_.stop() 호출에 의해)
            MLOG_INFO("API server listener on port %d has stopped.", this->port_);
        } catch (const std::exception& e) {
            MLOG_ERROR("Exception in server thread (port %d): %s", this->port_, e.what());
        } catch (...) {
            MLOG_ERROR("Unknown exception in server thread (port %d).", this->port_);
        }
        this->is_running_.store(false); // 스레드 종료 시 확실히 false로 설정
    });

    // 서버 스레드가 실제로 리스닝을 시작했는지 또는 즉시 실패했는지 확인하는 로직
    // (bind_to_port 실패 시 스레드가 빠르게 종료될 수 있음)
    int startup_wait_count = 0;
    const int max_startup_wait_count = 100; // 최대 5초 (100 * 50ms) 대기
    bool server_confirmed_running_by_flag = false;

    while(startup_wait_count < max_startup_wait_count) {
        if (is_running_.load()) { // 우리 내부 플래그가 true가 되면 listen 직전까지는 간 것
            server_confirmed_running_by_flag = true;
            break;
        }
        // 스레드가 생성되었지만 is_running_이 false이고, 스레드가 더 이상 joinable하지 않다면,
        // 스레드가 시작하자마자 (bind 실패 등으로) 종료되었을 가능성이 높음.
        if (!server_thread_.joinable() && startup_wait_count > 0) { // 스레드 생성 후 잠시 기다린 후 체크
             MLOG_ERROR("Server thread exited prematurely. Check for bind errors or other early failures on port %d.", port_);
             is_running_.store(false); // 확실히 false
             break;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
        startup_wait_count++;
    }

    if (server_confirmed_running_by_flag && svr_.is_running()) { // httplib의 is_running도 확인 (선택적)
        MLOG_INFO("RestApiServer started successfully and is now listening on %s:%d.", address_.c_str(), port_);
    } else {
        MLOG_ERROR("RestApiServer failed to start listening properly on port %d.", port_);
        // 스레드가 아직 남아있을 수 있으므로 정리 시도
        if (is_running_.load()) { // 만약 is_running_은 true인데 svr.is_running이 false인 이상한 상태라면
            svr_.stop(); // httplib에 중지 요청
        }
        is_running_.store(false); // 우리 플래그도 확실히 false로
        if (server_thread_.joinable()) {
            server_thread_.join(); // 스레드 종료 대기
        }
        throw std::runtime_error("API Server failed to start listening.");
    }
}

void RestApiServer::stop() {
    // is_running_을 false로 바꾸고, 이전 값이 true였는지 확인 (중복 stop 방지)
    if (is_running_.exchange(false)) {
        MLOG_INFO("Stopping RestApiServer on port %d...", port_);
        svr_.stop(); // httplib 서버에 중지 요청 (listen 루프를 빠져나오게 함)

        if (server_thread_.joinable()) { // 스레드가 아직 실행 중(join 가능)이면
            try {
                server_thread_.join(); // 스레드 종료를 기다림
                MLOG_INFO("Server thread on port %d joined successfully.", port_);
            } catch (const std::system_error& e) {
                MLOG_ERROR("System error while joining server thread on port %d: %s (code: %d)", port_, e.what(), e.code().value());
            } catch (const std::exception& e) {
                MLOG_ERROR("Generic exception while joining server thread on port %d: %s", port_, e.what());
            }
        }
        MLOG_INFO("RestApiServer on port %d stopped.", port_);
    } else {
        MLOG_INFO("RestApiServer on port %d was not running or already stopping.", port_);
        // 이미 중지되었거나 시작 중 실패한 경우에도, 스레드가 남아있을 수 있으므로 join 시도
        if (server_thread_.joinable()) {
            try { server_thread_.join(); } catch (...) { /* 예외 무시 (최대한 정리) */ }
        }
    }
}

void RestApiServer::setup_routes() {
    // 기본 HTTP 헤더 설정
    svr_.set_default_headers({
        {"Server", "HomographyApiService/1.0"},
        {"Content-Type", "application/json"}, // 기본 응답 타입을 JSON으로 설정
        {"Access-Control-Allow-Origin", "*"}, // CORS: 모든 출처 허용 (프로덕션에서는 특정 도메인으로 제한 권장)
        {"Access-Control-Allow-Methods", "POST, GET, OPTIONS"}, // 허용할 HTTP 메소드
        {"Access-Control-Allow-Headers", "Content-Type, Authorization"} // 허용할 요청 헤더
    });

    // 전역 에러 핸들러: 라우트에서 처리되지 않은 에러 발생 시 호출됨
    svr_.set_error_handler([&](const httplib::Request& req, httplib::Response& res) {
        json error_response_body;
        error_response_body["success"] = false;
        error_response_body["error"] = "HTTP Error";
        error_response_body["status_code"] = res.status;
        error_response_body["message"] = httplib::status_message(res.status); // HTTP 상태 코드에 대한 기본 메시지
        error_response_body["path"] = req.path;
        res.set_content(error_response_body.dump(), "application/json");
        MLOG_ERROR("Global Error Handler: Status %d for %s %s. Path: %s", res.status, req.method.c_str(), req.path.c_str(), req.path.c_str());
    });

    // 전역 예외 핸들러: 핸들러 함수 내에서 발생한 C++ 예외 처리
    svr_.set_exception_handler([&](const httplib::Request& req, httplib::Response& res, std::exception_ptr ep) {
        json error_response_body;
        error_response_body["success"] = false;
        res.status = 500; // 내부 서버 오류로 기본 설정

        try {
            if (ep) { // 예외 포인터가 유효하면
                std::rethrow_exception(ep); // 예외를 다시 던져서 catch 블록에서 처리
            }
        } catch (const std::exception &e) {
            error_response_body["error"] = "Internal Server Exception";
            error_response_body["details"] = e.what(); // 예외 메시지 포함
            MLOG_ERROR("Handler Exception: %s %s -> %s", req.method.c_str(), req.path.c_str(), e.what());
        } catch (...) {
            error_response_body["error"] = "Unknown Internal Server Exception";
            MLOG_ERROR("Handler Exception: %s %s -> Unknown exception type", req.method.c_str(), req.path.c_str());
        }
        res.set_content(error_response_body.dump(), "application/json");
    });

    // 요청 로거: 모든 요청 및 응답 상태를 로그로 기록
    svr_.set_logger([&](const httplib::Request& req, const httplib::Response& res) {
        MLOG_INFO("API Log: %s %s (Remote: %s) -> Status: %d",
                  req.method.c_str(), req.path.c_str(), req.remote_addr.c_str(), res.status);
        if(!req.body.empty() && req.path == "/api/homography/calculate_dynamic") { // POST 요청 본문 로그 (민감 정보 주의)
            MLOG_DEBUG("Request Body for %s: %s", req.path.c_str(), req.body.substr(0, 500).c_str()); // 처음 500자만
        }
    });

    // CORS Preflight 요청(OPTIONS) 처리
    svr_.Options("/api/homography/calculate_dynamic", [](const httplib::Request&, httplib::Response& res) {
        // 필요한 헤더들을 이미 set_default_headers에서 설정했을 수 있지만, 명시적으로 다시 설정 가능
        // res.set_header("Access-Control-Allow-Origin", "*");
        // res.set_header("Access-Control-Allow-Headers", "Content-Type");
        // res.set_header("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.status = 204; // No Content - 성공적인 preflight 응답
    });
    svr_.Options("/health", [](const httplib::Request&, httplib::Response& res) {
        res.status = 204;
    });


    // --- API 엔드포인트 정의 ---
    // weak_ptr를 사용하여 서버 객체의 유효성 검사 (핸들러 실행 시점)
    std::weak_ptr<RestApiServer> weak_self = shared_from_this();

    // 1. Health Check 엔드포인트 (GET /health)
    svr_.Get("/health", [weak_self](const httplib::Request& /*req*/, httplib::Response& res) {
        if (auto self = weak_self.lock()) { // RestApiServer 인스턴스가 아직 유효한지 확인
            json response_body;
            response_body["status"] = "healthy";
            response_body["message"] = "C++ Homography API Service is running.";
            response_body["timestamp"] = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
            res.set_content(response_body.dump(), "application/json");
            res.status = 200; // OK
        } else {
            res.status = 503; // Service Unavailable - 서버 객체가 소멸된 경우
            MLOG_ERROR("/health request failed: Server instance no longer available.");
        }
    });

    // 2. 호모그래피 계산 엔드포인트 (POST /api/homography/calculate_dynamic)
    svr_.Post("/api/homography/calculate_dynamic", [weak_self](const httplib::Request& req, httplib::Response& res) {
        auto self = weak_self.lock(); // 서버 인스턴스 유효성 검사
        if (!self) {
            res.status = 503; // Service Unavailable
            MLOG_ERROR("POST /api/homography/calculate_dynamic: Server instance no longer available.");
            return;
        }
        if (!self->homography_calculator_) { // 계산기 객체 유효성 검사
            res.status = 500; // Internal Server Error
            json err_body = {{"success", false}, {"error", "HomographyCalculator is not initialized in the server."}};
            res.set_content(err_body.dump(), "application/json");
            MLOG_ERROR("HomographyCalculator instance is null in POST /api/homography/calculate_dynamic handler.");
            return;
        }

        MLOG_INFO("Processing POST /api/homography/calculate_dynamic. Body length: %d", req.body.length());

        json request_body_json;
        try {
            if (req.body.empty()) { // 요청 본문이 비어있는 경우
                throw std::runtime_error("Request body is empty. Expected JSON data.");
            }
            request_body_json = json::parse(req.body); // 요청 본문을 JSON으로 파싱
        } catch (const json::parse_error& e) {
            res.status = 400; // Bad Request - JSON 파싱 실패
            json err_body = {{"success", false}, {"error", "Invalid JSON format in request body."}, {"details", e.what()}};
            res.set_content(err_body.dump(), "application/json");
            MLOG_WARN("Failed to parse JSON request body for /api/homography/calculate_dynamic: %s", e.what());
            return;
        } catch (const std::exception& e) { // 기타 예외 (예: runtime_error)
             res.status = 400;
             json err_body = {{"success", false}, {"error", "Error processing request body."}, {"details", e.what()}};
             res.set_content(err_body.dump(), "application/json");
             MLOG_WARN("Error processing request body for /api/homography/calculate_dynamic: %s", e.what());
             return;
        }


        // 요청된 JSON 본문에서 calibration_config와 survey_data 객체 추출
        if (!request_body_json.contains(CALIBRATION_CONFIG_KEY_IN_REQUEST_BODY) ||
            !request_body_json.at(CALIBRATION_CONFIG_KEY_IN_REQUEST_BODY).is_object()) {
            res.status = 400; // Bad Request
            json err_body = {{"success", false}, {"error", std::string("Request body must contain '") + CALIBRATION_CONFIG_KEY_IN_REQUEST_BODY + std::string("' as a JSON object.")}};
            res.set_content(err_body.dump(), "application/json");
            MLOG_WARN("Missing or invalid '%s' in JSON request body.", CALIBRATION_CONFIG_KEY_IN_REQUEST_BODY);
            return;
        }
        if (!request_body_json.contains(SURVEY_DATA_KEY_IN_REQUEST_BODY) ||
            !request_body_json.at(SURVEY_DATA_KEY_IN_REQUEST_BODY).is_object()) {
            res.status = 400; // Bad Request
            json err_body = {{"success", false}, {"error", std::string("Request body must contain '") + SURVEY_DATA_KEY_IN_REQUEST_BODY + std::string("' as a JSON object.")}};
            res.set_content(err_body.dump(), "application/json");
            MLOG_WARN("Missing or invalid '%s' in JSON request body.", SURVEY_DATA_KEY_IN_REQUEST_BODY);
            return;
        }

        const auto& calibration_json_data = request_body_json.at(CALIBRATION_CONFIG_KEY_IN_REQUEST_BODY);
        const auto& survey_json_data      = request_body_json.at(SURVEY_DATA_KEY_IN_REQUEST_BODY);

        // HomographyCalculator를 사용하여 계산 수행
        try {
            json calculation_result = self->homography_calculator_->calculateWithProvidedData(calibration_json_data, survey_json_data);

            // 계산 결과에 따라 HTTP 상태 코드 설정
            if (calculation_result.value("success", false)) {
                res.status = 200; // OK
            } else {
                // 계산 실패 시, HomographyCalculator가 반환한 JSON에 에러 메시지가 있을 것임
                // 클라이언트에게 어떤 문제가 있었는지 알려주기 위해 4xx 또는 5xx 상태 코드 사용 가능
                // 예: 입력 데이터 문제로 계산 불가 시 422 (Unprocessable Entity)
                res.status = calculation_result.value("status_code", 422); // 계산기가 상태 코드를 제공하지 않으면 422 기본값
            }
            res.set_content(calculation_result.dump(), "application/json"); // 최종 결과 전송
        } catch (const std::exception& e) {
            // HomographyCalculator 내부에서 발생한 예외 처리 (로깅은 Calculator 내부에서도 할 수 있음)
            MLOG_ERROR("Exception during homography calculation triggered by API: %s", e.what());
            res.status = 500; // Internal Server Error
            json err_body = {{"success", false}, {"error", "Homography calculation processing failed on server."}, {"details", e.what()}};
            res.set_content(err_body.dump(), "application/json");
        }
    });

    MLOG_INFO("All API routes have been configured for RestApiServer.");
}
