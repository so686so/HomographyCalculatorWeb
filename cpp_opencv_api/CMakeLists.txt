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
# raid:1.0 이미지에는 OpenCV 4.6.0이 소스에서 컴파일되어 설치되어 있습니다.
find_package(OpenCV 4.6.0 REQUIRED COMPONENTS core imgproc calib3d features2d) # 필요한 OpenCV 모듈 명시
if(NOT OpenCV_FOUND)
    message(FATAL_ERROR "OpenCV library (version 4.6.0 or compatible) not found. raid:1.0 image should provide this.")
else()
    message(STATUS "Found OpenCV version: ${OpenCV_VERSION}")
    message(STATUS "OpenCV include directories: ${OpenCV_INCLUDE_DIRS}")
    message(STATUS "OpenCV libraries: ${OpenCV_LIBS}")
endif()

# 2. Threads (pthreads) 찾기 - C++ 표준 스레딩 라이브러리 사용을 위함
# Threads::Threads 타겟을 사용하기 위해 명시적으로 호출합니다.
find_package(Threads REQUIRED)
if(NOT Threads_FOUND)
    message(FATAL_ERROR "Threads (pthreads) library not found. This is essential for std::thread.")
else()
    message(STATUS "Threads (pthreads) library found.")
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
        ${LIBS_DIR}/json/include       # nlohmann/json.hpp가 libs/json/include/nlohmann/json.hpp 에 있다고 가정
                                        # 또는 실제 nlohmann/json.hpp의 위치에 맞게 경로 수정
                                        # 예: 만약 libs/json.hpp 라면, ${LIBS_DIR} 만으로 충분하고 #include "json.hpp" 사용
)
# nlohmann/json.hpp 헤더 파일의 정확한 위치에 따라 위 경로를 조정해주세요.
# 만약 cpp_opencv_api/libs/json.hpp 와 같이 사용한다면,
# target_include_directories(${EXECUTABLE_NAME} PRIVATE ${LIBS_DIR}) 로 하고,
# 소스 코드에서는 #include "json.hpp" 로 포함합니다.

# --- 라이브러리 링크 ---
target_link_libraries(${EXECUTABLE_NAME}
    PRIVATE
        ${OpenCV_LIBS}      # OpenCV 라이브러리
        Threads::Threads    # C++ 표준 스레딩 라이브러리 (std::thread, std::mutex 등)
        stdc++fs            # std::experimental::filesystem 사용을 위한 라이브러리 링크 추가
)
# httplib은 보통 헤더 전용이거나, 컴파일이 필요한 경우 해당 라이브러리를 추가로 링크해야 합니다.
# 만약 httplib.cc 파일도 함께 사용한다면 PROJECT_SOURCES에 추가하거나 별도 라이브러리로 빌드 후 링크.
# nlohmann/json은 헤더 전용이므로 별도 링크 필요 없음.

# --- (선택 사항) 컴파일러 플래그 설정 ---
# 예: 경고 레벨, 최적화 등
# target_compile_options(${EXECUTABLE_NAME} PRIVATE -Wall -Wextra -O2)

# 빌드 완료 후 메시지 (선택 사항)
message(STATUS "Project ${PROJECT_NAME} configured. Target: ${EXECUTABLE_NAME}. Build with 'make' or your chosen generator.")
