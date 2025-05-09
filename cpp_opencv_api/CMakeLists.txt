# CMake 최소 요구 버전 설정
cmake_minimum_required(VERSION 3.13) # OpenCV find_package 및 C++17 지원 등을 고려하여 3.13 이상 권장

# 프로젝트 이름 및 언어 설정
project(CppHomographyApiService CXX)

# C++ 표준 설정 (C++17 권장)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED True)
set(CMAKE_CXX_EXTENSIONS OFF) # 컴파일러 확장 기능 사용 안 함 (표준 준수)

# 실행 파일 이름 설정
set(EXECUTABLE_NAME cpp_homography_api_server)

# --- 외부 라이브러리 찾기 ---

# 1. OpenCV 찾기
# 시스템에 OpenCV가 설치되어 있어야 합니다.
# OpenCV_DIR 환경 변수를 설정하거나 CMake가 찾을 수 있는 경로에 있어야 합니다.
find_package(OpenCV REQUIRED COMPONENTS core imgproc calib3d features2d highgui) # 필요한 OpenCV 모듈 명시
if(NOT OpenCV_FOUND)
    message(FATAL_ERROR "OpenCV library not found. Please install OpenCV or set OpenCV_DIR.")
else()
    message(STATUS "OpenCV version: ${OpenCV_VERSION}")
    message(STATUS "OpenCV include directories: ${OpenCV_INCLUDE_DIRS}")
    message(STATUS "OpenCV libraries: ${OpenCV_LIBS}")
endif()

# --- 프로젝트 소스 파일 및 헤더 파일 경로 설정 ---

# 소스 파일이 있는 디렉토리 (CMakeLists.txt 기준 상대 경로)
set(SOURCE_DIR src)
# (선택 사항) 외부 라이브러리 헤더가 있는 디렉토리
set(LIBS_DIR libs) # 예: libs/httplib.h, libs/json/json.hpp

# 실행 파일에 포함될 소스 파일 목록
set(PROJECT_SOURCES
    ${SOURCE_DIR}/main.cpp
    ${SOURCE_DIR}/RestApiServer.cpp
    ${SOURCE_DIR}/HomographyCalculator.cpp
    ${SOURCE_DIR}/Calibrator.cpp      # 사용자 제공
    ${SOURCE_DIR}/MgenLogger.cpp     # 사용자 제공
)

# --- 실행 파일 생성 ---
add_executable(${EXECUTABLE_NAME} ${PROJECT_SOURCES})

# --- Include 디렉토리 설정 ---
target_include_directories(${EXECUTABLE_NAME}
    PRIVATE
        ${SOURCE_DIR}                   # 프로젝트 내부 헤더 파일 (RestApiServer.h 등)
        ${OpenCV_INCLUDE_DIRS}          # OpenCV 헤더 파일
        ${LIBS_DIR}                     # httplib.h가 libs/httplib.h에 있다고 가정
        ${LIBS_DIR}/json/include       # nlohmann/json.hpp가 libs/json/include/nlohmann/json.hpp 에 있다고 가정 (또는 libs/json/json.hpp)
                                        # 실제 nlohmann/json.hpp의 위치에 맞게 경로 수정 필요
                                        # 예: 만약 libs/json.hpp 라면, ${LIBS_DIR} 만으로 충분하고 #include "json.hpp" 사용
                                        # 예: 만약 libs/json/single_include/nlohmann/json.hpp 라면, ${LIBS_DIR}/json/single_include
)
# 참고: nlohmann/json.hpp를 프로젝트 내에 복사해두는 경우,
# 보통 #include "json.hpp" (또는 "nlohmann/json.hpp") 형태로 사용하므로,
# 해당 파일이 있는 디렉토리의 상위 디렉토리를 include path에 추가합니다.
# 예: 만약 cpp_opencv_api/libs/json/json.hpp 라면, target_include_directories에 ${LIBS_DIR} 추가 후
# 소스코드에서 #include "json/json.hpp" 사용.
# 만약 cpp_opencv_api/libs/json.hpp 라면, target_include_directories에 ${LIBS_DIR} 추가 후
# 소스코드에서 #include "json.hpp" 사용.
# 위 예시는 libs/json/include/nlohmann/json.hpp 또는 libs/json/json.hpp 를 가정하고 작성.
# 실제 nlohmann/json.hpp 파일의 위치에 따라 경로를 정확히 지정해주세요.
# 만약 libs/json.hpp 로 사용한다면, ${LIBS_DIR} 만 추가하고, 소스에서는 #include "json.hpp" 로 사용.

# --- 라이브러리 링크 ---
target_link_libraries(${EXECUTABLE_NAME}
    PRIVATE
        ${OpenCV_LIBS}      # OpenCV 라이브러리
        Threads::Threads    # std::thread, std::mutex 등 사용 시 (CMake 3.1 이상 권장)
                            # 또는 pthread (구형 CMake 또는 특정 플랫폼)
)
# httplib은 보통 헤더 전용이거나, 컴파일이 필요한 경우 해당 라이브러리를 추가로 링크해야 합니다.
# 만약 httplib.cc 파일도 함께 사용한다면 PROJECT_SOURCES에 추가하거나 별도 라이브러리로 빌드 후 링크.
# nlohmann/json은 헤더 전용이므로 별도 링크 필요 없음.

# --- (선택 사항) 컴파일러 플래그 설정 ---
# 예: 경고 레벨, 최적화 등
# target_compile_options(${EXECUTABLE_NAME} PRIVATE -Wall -Wextra -O2)

# --- (선택 사항) 설치 규칙 (make install 시) ---
# install(TARGETS ${EXECUTABLE_NAME} DESTINATION bin)

# 빌드 완료 후 메시지 (선택 사항)
message(STATUS "Project ${PROJECT_NAME} configured. Build with 'make' or your chosen generator.")
