# 베이스 이미지로 사용자 정의 raid:1.0 이미지를 사용합니다.
# 이 이미지는 Ubuntu 18.04, CUDA 11.8, cuDNN 8.6, OpenCV 4.6, CMake 3.17.3, g++ 등을
# 이미 포함하고 있어야 합니다. (사용자가 제공한 Dockerfile 기반)
FROM raid:1.0

# 작업 환경 변수 설정 (베이스 이미지에 이미 설정되어 있을 수 있음)
# ENV DEBIAN_FRONTEND=noninteractive # raid:1.0 Dockerfile에 이미 ARG로 선언됨
# ENV TZ=Asia/Seoul                  # raid:1.0 Dockerfile에 이미 ENV로 설정됨

# (선택 사항) curl 설치 확인 및 설치
# healthcheck에 curl을 사용하고, raid:1.0 이미지에 curl 실행 파일이 없다면 설치합니다.
# raid:1.0에 libcurl4-openssl-dev는 있지만, curl 실행 파일 자체는 없을 수 있습니다.
# RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
# 위 RUN 명령어는 raid:1.0에 curl이 없을 경우에만 주석 해제합니다.
# raid:1.0 Dockerfile을 보면 curl을 직접 설치하는 부분은 없습니다. libcurl4-openssl-dev만 있습니다.
# 따라서 healthcheck에 curl을 사용하려면 아래 줄의 주석을 해제하는 것이 안전합니다.
RUN if ! command -v curl &> /dev/null; then \
        apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*; \
    fi

# C++ API 소스 코드를 빌드하고 실행할 작업 디렉토리 설정
WORKDIR /usr/src/cpp_api_service

# 프로젝트 소스 코드 전체(src/, libs/, CMakeLists.txt 등)를 이미지 내부의 작업 디렉토리로 복사
COPY . .

# CMake를 사용하여 빌드 디렉토리 생성 및 빌드 실행
# raid:1.0 이미지에 CMake (3.17.3), g++, make, OpenCV (4.6.0)가 이미 설치되어 있다고 가정합니다.
# CMAKE_BUILD_TYPE=Release 로 릴리즈 모드 빌드를 수행합니다.
RUN mkdir -p build && \
    cd build && \
    cmake -DCMAKE_BUILD_TYPE=Release .. && \
    make -j$(nproc)
    # raid:1.0 Dockerfile에서 CPU_CORE_NUM ARG를 사용했으므로,
    # make -j${CPU_CORE_NUM} 와 같이 사용할 수도 있으나, nproc이 더 일반적입니다.
    # 만약 CPU_CORE_NUM을 빌드 시점에 전달하고 싶다면 Dockerfile ARG로 다시 선언해야 합니다.

# 애플리케이션 실행을 위한 작업 디렉토리 변경 (빌드된 실행 파일이 있는 곳)
# CMakeLists.txt에서 실행 파일이 build/ 디렉토리에 생성된다고 가정 (예: build/cpp_homography_api_server)
WORKDIR /usr/src/cpp_api_service/build
# 또는 실행 파일을 다른 곳으로 옮기고 싶다면 아래와 같이 COPY 또는 RUN mv 사용
# RUN cp build/cpp_homography_api_server /usr/local/bin/
# WORKDIR /usr/local/bin/

# 애플리케이션이 리슨할 포트 명시 (C++ RestApiServer에서 사용하는 포트)
EXPOSE 3004

# 컨테이너 시작 시 실행될 기본 명령어
# CMakeLists.txt에서 설정한 실행 파일 이름(예: cpp_homography_api_server)과
# main.cpp에서 처리하는 포트 번호 인자를 사용합니다.
# 실행 파일이 /usr/src/cpp_api_service/build/ 디렉토리에 있다고 가정합니다.
CMD ["./cpp_homography_api_server", "3004"]
# 만약 실행 파일을 /usr/local/bin 등으로 옮겼다면:
# CMD ["cpp_homography_api_server", "3004"]
