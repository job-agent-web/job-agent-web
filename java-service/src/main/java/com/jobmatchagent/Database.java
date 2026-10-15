package com.jobmatchagent;

import java.net.*;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.time.*;
import java.util.*;

final class Database {
    private final String url;
    private final Properties properties = new Properties();
    Database(String connectionString) {
        if (connectionString == null || connectionString.isBlank())
            throw new IllegalStateException("DATABASE_URL is required. Set the Neon PostgreSQL connection string.");
        if (connectionString.startsWith("jdbc:h2:")) { url = connectionString; return; }
        if (connectionString.startsWith("jdbc:postgresql:")) {
            url = connectionString;
            if (!connectionString.contains("sslmode=")) properties.setProperty("sslmode", "verify-full");
        } else {
            URI uri = URI.create(connectionString);
            if (!Set.of("postgres", "postgresql").contains(uri.getScheme()) || uri.getHost() == null)
                throw new IllegalArgumentException("DATABASE_URL must be a PostgreSQL connection string.");
            String[] credentials = Optional.ofNullable(uri.getRawUserInfo()).orElse("").split(":", 2);
            properties.setProperty("user", decode(credentials[0]));
            if (credentials.length > 1) properties.setProperty("password", decode(credentials[1]));
            properties.setProperty("sslmode", "verify-full");
            String query = uri.getRawQuery();
            if (query != null) for (String part : query.split("&")) {
                String[] pair = part.split("=", 2);
                String key = decode(pair[0]);
                if (Set.of("sslmode", "channel_binding", "options").contains(key) && pair.length == 2)
                    properties.setProperty(key.equals("channel_binding") ? "channelBinding" : key, decode(pair[1]));
            }
            url = "jdbc:postgresql://" + uri.getHost() + (uri.getPort() < 0 ? "" : ":" + uri.getPort()) + uri.getRawPath();
        }
        properties.setProperty("connectTimeout", "10");
        properties.setProperty("socketTimeout", "30");
        properties.setProperty("ApplicationName", "jobmatchagent-java");
    }
    static String decode(String value) { return URLDecoder.decode(value.replace("+", "%2B"), StandardCharsets.UTF_8); }
    Connection open() throws SQLException { return DriverManager.getConnection(url, properties); }
    void migrate() throws Exception {
        String sql;
        try (var stream = Database.class.getResourceAsStream("/schema.sql")) {
            sql = new String(Objects.requireNonNull(stream).readAllBytes(), StandardCharsets.UTF_8);
        }
        transaction(connection -> {
            if (connection.getMetaData().getDatabaseProductName().equals("PostgreSQL"))
                one(connection, "SELECT pg_advisory_xact_lock(713087414) AS schema_lock");
            for (String command : sql.split(";")) if (!command.isBlank()) execute(connection, command);
            return null;
        });
    }
    interface Work<T> { T run(Connection connection) throws Exception; }
    <T> T transaction(Work<T> work) throws Exception {
        try (Connection connection = open()) {
            connection.setAutoCommit(false);
            try { T result = work.run(connection); connection.commit(); return result; }
            catch (Exception e) { connection.rollback(); throw e; }
        }
    }
    static int execute(Connection connection, String sql, Object... args) throws SQLException {
        try (PreparedStatement statement = statement(connection, sql, args)) { return statement.executeUpdate(); }
    }
    static List<Map<String, Object>> query(Connection connection, String sql, Object... args) throws SQLException {
        try (PreparedStatement statement = statement(connection, sql, args); ResultSet rs = statement.executeQuery()) {
            List<Map<String, Object>> rows = new ArrayList<>();
            while (rs.next()) {
                Map<String, Object> row = new LinkedHashMap<>();
                for (int i = 1; i <= rs.getMetaData().getColumnCount(); i++) {
                    Object value = rs.getObject(i);
                    if (value instanceof Timestamp timestamp) value = timestamp.toInstant().toString();
                    if (value instanceof OffsetDateTime timestamp) value = timestamp.toInstant().toString();
                    if (value instanceof java.sql.Array array) value = Arrays.asList((Object[]) array.getArray());
                    if (value instanceof UUID) value = value.toString();
                    row.put(rs.getMetaData().getColumnLabel(i).toLowerCase(Locale.ROOT), value);
                }
                rows.add(row);
            }
            return rows;
        }
    }
    static Map<String, Object> one(Connection connection, String sql, Object... args) throws SQLException {
        List<Map<String, Object>> rows = query(connection, sql, args);
        return rows.isEmpty() ? null : rows.getFirst();
    }
    private static PreparedStatement statement(Connection connection, String sql, Object... args) throws SQLException {
        PreparedStatement statement = connection.prepareStatement(sql);
        for (int i = 0; i < args.length; i++) {
            Object value = args[i];
            if (value instanceof Instant instant) value = Timestamp.from(instant);
            statement.setObject(i + 1, value);
        }
        return statement;
    }
}
