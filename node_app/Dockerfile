# Node.js 18 LTS (또는 원하는 최신 버전) 이미지를 기반으로 합니다.
FROM node:18-alpine
# FROM node:20-alpine # 또는 Node.js 20

# 앱 디렉토리 생성
WORKDIR /usr/src/app

# 앱 의존성 복사 및 설치
# package.json 과 package-lock.json (존재한다면)을 모두 복사합니다.
COPY package*.json ./
RUN npm install
# 프로덕션 빌드의 경우: RUN npm ci --only=production

# 앱 소스코드 복사
COPY . .

# 앱 실행 명령어
CMD [ "node", "server.js" ]