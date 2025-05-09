#ifndef __MGEN_LOGGER_H__
#define __MGEN_LOGGER_H__

/** -------------------------------------------------------
 *  MgenSolution's Thread-safe Logger
 * --------------------------------------------------------
 *  Author      : So Byung Jun
 *  Last Update : 2025.03.18
 * --------------------------------------------------------
 *  Ref. : https://gist.github.com/39f2e39273c625d96790.git
 * -------------------------------------------------------- */

#include <string>
#include <chrono>
#include <mutex>
#include <memory>
#include <fstream>
#include <unordered_map>
#include <functional>

/* ----------------------------------------------------------------------------------------------------------------
 | Define Shortcut
 +--------------------------------------------------------------------------------------------------------------- */
#define MLOG_TRACE( fmt, args... ) MGEN::__TRACE( MGEN::GetLogString(fmt, ##args) )
#define MLOG_DEBUG( fmt, args... ) MGEN::__DEBUG( MGEN::GetLogString(fmt, ##args) )
#define MLOG_INFO( fmt, args... )  MGEN::__INFO ( MGEN::GetLogString(fmt, ##args) )
#define MLOG_WARN( fmt, args... )  MGEN::__WARN ( MGEN::GetLogString(fmt, ##args) )
#define MLOG_ERROR( fmt, args... ) MGEN::__ERROR( MGEN::GetLogString(fmt, ##args) )
/* ---------------------------------------------------------------------------------------------------------------- */

namespace MGEN { // Mgensolution's default namespace

    // Const define values for setting
    constexpr size_t MAX_LOG_MSG_LEN     = 2048; /* 2048 byte */
    constexpr uint   DEFAULT_REOPEN_SECS = 3600;

    // Const define values for error handling
    constexpr int ERROR_LOG_PTR_FREE_ALREADY = -1;
    constexpr int ERROR_LOG_MSG_LEN_OVERFLOW = -2;

    // The Log levels we support
    enum class LogLevel  : uint8_t { TRACE, DEBUG, INFO, WARN, ERROR };
    enum class LogPrefix : uint8_t { OffColor, OnColor };
    enum class LogType   : uint8_t { NotSet, Console, File };

    // set constexpr log cut level
    #if defined(DEBUG_MODE)
      constexpr LogLevel LOG_LEVEL_CUTOFF = LogLevel::TRACE;
    #else
      constexpr LogLevel LOG_LEVEL_CUTOFF = LogLevel::INFO;
    #endif

    // Logger Configure Setting Class
    class LoggerConfig
    {
    public:
        // Constructor
        LoggerConfig();

        // Destructor
        ~LoggerConfig() = default;

        // Setter
        LoggerConfig& setLogType( const LogType flag );
        LoggerConfig& setPrefixUseColor( const LogPrefix flag );
        LoggerConfig& setReOpenIntervals( const unsigned int reopen_sec );
        LoggerConfig& setLogSaveFile( const std::string& file_name );

        // Getter
        LogType      getLogPrintOutType( void ) const { return this->log_print_out_type; }
        LogPrefix    getLogPrefixUseClr( void ) const { return this->log_prefix_colored; }
        unsigned int getLogReOpenSecond( void ) const { return this->log_reopen_seconds; }
        std::string  getLogSaveFileName( void ) const { return this->log_save_file_name; }

        // Checker
        bool isPrefixColored( void ) const;

    private:
        LogType      log_print_out_type = LogType::Console;
        LogPrefix    log_prefix_colored = LogPrefix::OnColor;
        unsigned int log_reopen_seconds = DEFAULT_REOPEN_SECS;
        std::string  log_save_file_name = "";
    }; // cls:LoggerConfig

    // Need to define it because there is no hasher for enumeration classes
    struct log_lvl_enum_hasher {
        template <typename T> std::size_t operator()( T t ) const {
            return static_cast<std::size_t>( t );
        }
    };
    using LogPrefixMap = std::unordered_map<LogLevel, std::string, log_lvl_enum_hasher>;

    // Logger base class, not pure virtual so you can use as a null logger if you want
    class Logger
    {
    public:
        // Default constructor delete
        Logger() = delete;

        // must construct with config, but default Logger class not work use that
        explicit Logger( const LoggerConfig& cfg ) {};

        // Destructor must virtual
        virtual ~Logger() = default;

        virtual void log( const std::string& msg, const LogLevel level ) = 0;
        virtual void log( const std::string& msg ) = 0;
        virtual void logClose( void ) = 0;

    protected:
        // Return format : 'yr.mo.dy hr:mn:sc.xxx'
        static const std::string timeStamp() noexcept;

    protected:
        mutable std::mutex lock;
    }; // cls:Logger

    // Logger that writes to console std out
    class ConsoleLogger : public Logger
    {
    public:
        // Default constructor delete
        ConsoleLogger() = delete;

        // must construct with config
        explicit ConsoleLogger( const LoggerConfig& cfg );

        virtual void log( const std::string& msg, const LogLevel level ) override final;
        virtual void log( const std::string& msg ) override final;
        virtual void logClose( void ) override final;

    protected:
        const LogPrefixMap prefixes;
    }; // cls:ConsoleLogger

    // Logger that writes to File
    class FileLogger : public Logger
    {
    public:
        // Default constructor delete
        FileLogger() = delete;

        // must construct with config
        explicit FileLogger( const LoggerConfig& cfg );

        // Destructor
        ~FileLogger() { logClose(); }

        virtual void log( const std::string& msg, const LogLevel level ) override final;
        virtual void log( const std::string& msg ) override final;
        virtual void logClose( void ) override final;

    protected:
        void reOpen( void );

        std::string   file_name;
        std::ofstream file_stream;
        std::chrono::seconds re_open_intervals;
        std::chrono::system_clock::time_point last_re_open;
    }; // cls:FileLogger

    // A factory that can create Loggers ( that derive from 'Logger' ) via function pointers
    using LoggerCreator = std::function<std::unique_ptr<Logger>(const LoggerConfig&)>;
    class LoggerFactory
    {
    public:
        // Constructor
        LoggerFactory();

        // Producer
        std::unique_ptr<Logger> produce( const LoggerConfig& cfg ) const;

    protected:
        std::unordered_map<LogType, LoggerCreator, log_lvl_enum_hasher> creators;
    }; // cls:LoggerFactory

    LoggerFactory& get_factory(); // statically get a factory
    Logger*        get_logger( const LoggerConfig& config = LoggerConfig {} ); // get at the singleton
    void           initLogger( const LoggerConfig& config = LoggerConfig {} ); // configure the singleton (ONCE ONLY)

    // MACROS
    void __TRACE( const std::string& message );
    void __DEBUG( const std::string& message );
    void __INFO ( const std::string& message );
    void __WARN ( const std::string& message );
    void __ERROR( const std::string& message );

    // wrapping variable number of arguments format-string to std::string
    std::string GetLogString( const char* fmt, ... );

}; // namespace MGEN
#endif
