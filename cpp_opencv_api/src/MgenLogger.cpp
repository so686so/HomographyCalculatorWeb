#include "MgenLogger.h"

#include <stdio.h>
#include <stdarg.h>

#include <iostream>
#include <experimental/filesystem>

namespace MGEN { // Mgensolution's default namespace

    // use filesystem library
    namespace fs = std::experimental::filesystem;

    LoggerConfig::LoggerConfig()
        : log_print_out_type( LogType::Console )
        , log_prefix_colored( LogPrefix::OnColor )
        , log_reopen_seconds( DEFAULT_REOPEN_SECS )
        , log_save_file_name( "" )
    {
        //
    }

    LoggerConfig& LoggerConfig::setLogType( const LogType flag )
    {
        this->log_print_out_type = flag;
        return *this;
    }

    LoggerConfig& LoggerConfig::setPrefixUseColor( const LogPrefix flag )
    {
        this->log_prefix_colored = flag;
        return *this;
    }

    LoggerConfig& LoggerConfig::setReOpenIntervals( const unsigned int reopen_sec )
    {
        this->log_reopen_seconds = reopen_sec;
        return *this;
    }

    LoggerConfig& LoggerConfig::setLogSaveFile( const std::string& file_name )
    {
        this->log_save_file_name = file_name;
        return *this;
    }

    bool LoggerConfig::isPrefixColored( void ) const
    {
        return this->log_prefix_colored == LogPrefix::OnColor;
    }

    const std::string Logger::timeStamp() noexcept
    {
        // get the time with thread-safe
        const auto tp = std::chrono::system_clock::now();
        const auto tt = std::chrono::system_clock::to_time_t( tp );

        std::tm gmt {};
        gmtime_r( &tt, &gmt );

        // Calculate seconds to decimal places
        std::chrono::duration<double> fractional_seconds =
            ( tp - std::chrono::system_clock::from_time_t( tt ) ) + std::chrono::seconds( gmt.tm_sec );

        // format the string
        std::string buffer { "\r yr.mo.dy hr:mn:sc.xxx |" };
        sprintf( &buffer.front(), "\r %02d-%02d-%02d %02d:%02d:%06.3f |",
                    gmt.tm_year - 100, gmt.tm_mon + 1, gmt.tm_mday,
                ( gmt.tm_hour + 9/*KST*/ ) % 24, gmt.tm_min, fractional_seconds.count() );
        return buffer;
    }

    const LogPrefixMap off_color_prefix {
        { LogLevel::TRACE, " [TRACE] " },
        { LogLevel::DEBUG, " [DEBUG] " },
        { LogLevel::INFO,  " [INFO] "  },
        { LogLevel::WARN,  " [WARN] "  },
        { LogLevel::ERROR, " [ERROR] " }
    };
    const LogPrefixMap on_color_prefix {
        { LogLevel::TRACE, " [\x1b[37;1mTRACE\x1b[0m] " }, // White
        { LogLevel::DEBUG, " [\x1b[36;1mDEBUG\x1b[0m] " }, // Sky
        { LogLevel::INFO,  " [\x1b[32;1mINFO\x1b[0m] "  }, // Green
        { LogLevel::WARN,  " [\x1b[33;1mWARN\x1b[0m] "  }, // Yellow
        { LogLevel::ERROR, " [\x1b[31;1mERROR\x1b[0m] " }  // Red
    };

    ConsoleLogger::ConsoleLogger( const LoggerConfig& cfg ) : Logger( cfg )
        , prefixes( cfg.isPrefixColored() ? on_color_prefix : off_color_prefix )
    {
        //
    }

    void ConsoleLogger::log( const std::string& msg, const LogLevel level )
    {
        if( level < LOG_LEVEL_CUTOFF )
            return;

        std::string out;
        out.reserve( msg.length() + 64 );
        out.append( Logger::timeStamp() );
        out.append( prefixes.find( level )->second );
        out.append( msg );
        out.push_back( '\n' );
        log( out );
    }

    void ConsoleLogger::log( const std::string& msg )
    {
        // cout is thread-safe, to avoid multiple threads interleaving on one line
        // though, we make sure to only call the << operator once on std::cout
        // otherwise the << operators from different threads could interleave
        // obviously we don't care if flushes interleave
        // std::lock_guard<std::mutex> lk{lock};
        std::cout << msg;
        std::cout.flush();
    }

    void ConsoleLogger::logClose( void )
    {
        //
    }

    FileLogger::FileLogger( const LoggerConfig& cfg ) : Logger( cfg )
    {
        // grab the file name
        const auto name = cfg.getLogSaveFileName();

        // set file name
        if( name.empty() )
            throw std::runtime_error( "MGEN::FileLogger does not provide \'file_name\' config." );
        this->file_name = name;

        // if we specify an interval
        this->re_open_intervals = std::chrono::seconds( cfg.getLogReOpenSecond() );

        // crack the file open;
        reOpen();
    }

    void FileLogger::log( const std::string& msg, const LogLevel level )
    {
        if( level < LOG_LEVEL_CUTOFF )
            return;

        std::string out;
        out.reserve( msg.length() + 64 );
        out.append( Logger::timeStamp() );
        out.append( off_color_prefix.find( level )->second );
        out.append( msg );
        out.push_back( '\n' );
        log( out );
    }

    void FileLogger::log( const std::string& msg )
    {
        lock.lock();
        file_stream << msg;
        file_stream.flush();
        lock.unlock();
        this->reOpen();
    }

    void FileLogger::logClose( void )
    {
        if( file_stream.is_open() )
            file_stream.close();
    }

    void FileLogger::reOpen()
    {
        // check if it should be closed and reopened
        const auto now = std::chrono::system_clock::now();

        std::lock_guard<std::mutex> lck { lock };

        // 지정된 시간 간격(re_open_intervals)보다 크면 파일 재오픈
        if( now - last_re_open > re_open_intervals ) {

            last_re_open = now;

            // 기존 파일 스트림 닫기
            if( file_stream.is_open() ){
                file_stream.close();
            }

            // 파일 존재 여부 확인 및 디렉터리 자동 생성
            fs::path logFilePath { file_name };
            fs::path logDir = logFilePath.parent_path();

            if( !logDir.empty() && !fs::exists( logDir ) ){
                fs::create_directories( logDir );
            }

            // 파일 다시 열기 (기존 파일 유지 & 새로운 로그 추가)
            file_stream.open( file_name, std::ios::out | std::ios::app );
            if( !file_stream.is_open() ){
                throw std::runtime_error("Failed to reopen log file: " + file_name);
            }
        }
    }

    LoggerFactory::LoggerFactory()
    {
        creators.emplace( LogType::Console, []( const LoggerConfig& cfg )->std::unique_ptr<Logger> { return std::make_unique<ConsoleLogger>( cfg ); } );
        creators.emplace( LogType::File,    []( const LoggerConfig& cfg )->std::unique_ptr<Logger> { return std::make_unique<FileLogger>( cfg );    } );
    }

    std::unique_ptr<Logger> LoggerFactory::produce( const LoggerConfig& cfg ) const
    {
        auto it = creators.find( cfg.getLogPrintOutType() );

        if( it != creators.end() )
            return it->second( cfg );

        throw std::runtime_error("Couldn't produce logger: Unknown LogType.");
    }

    LoggerFactory& get_factory()
    {
        static LoggerFactory factory_singleton {};
        return factory_singleton;
    }

    Logger* get_logger( const LoggerConfig& config )
    {
        static std::unique_ptr<Logger> singleton( get_factory().produce( config ) );
        if( !singleton )
            return nullptr;
        return singleton.get();
    }

    void initLogger( const LoggerConfig& config )
    {
        get_logger( config );
    }

    static void __LOG( const std::string& message, const LogLevel type )
    {
        try {
            if( auto logger = get_logger(); logger != nullptr ) logger->log( message, type );
        }
        catch( int error_code ) {
            printf( "MGEN::Logger - %s():%d occured errors, code = %d, msg = %s\n",
                    __func__, __LINE__, error_code, message.c_str() );
        }
        catch( ... ) {
            printf( "MGEN::Logger - %s():%d occured errors, unknowned error, msg = %s\n",
                    __func__, __LINE__, message.c_str() );
        }
    }

    void __TRACE( const std::string& message )
    {
        MGEN::__LOG( message, LogLevel::TRACE );
    }

    void __DEBUG( const std::string& message )
    {
        MGEN::__LOG( message, LogLevel::DEBUG );
    }

    void __INFO ( const std::string& message )
    {
        MGEN::__LOG( message, LogLevel::INFO  );
    }

    void __WARN ( const std::string& message )
    {
        MGEN::__LOG( message, LogLevel::WARN  );
    }

    void __ERROR( const std::string& message )
    {
        MGEN::__LOG( message, LogLevel::ERROR );
    }

    std::string GetLogString( const char* fmt, ... )
    {
        char buffer[MAX_LOG_MSG_LEN] = { 0x00, };

        va_list args {};
        va_start( args, fmt );
        vsnprintf( buffer, MAX_LOG_MSG_LEN, fmt, args );
        va_end( args );

        std::string out( std::move( buffer ) );
        return out;
    }

}; // namespace MGEN
