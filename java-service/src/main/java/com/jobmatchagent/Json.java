package com.jobmatchagent;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;

final class Json {
    static final ObjectMapper MAPPER = new ObjectMapper();
    private Json() {}
    static Map<String, Object> object(String text) {
        try { return MAPPER.readValue(text, new TypeReference<LinkedHashMap<String, Object>>() {}); }
        catch (Exception e) { throw new ApiException(400, "Invalid JSON request."); }
    }
    static Object parse(String text) {
        try { return MAPPER.readValue(text, Object.class); }
        catch (Exception e) { throw new ApiException(502, "The service returned invalid JSON."); }
    }
    static String stringify(Object value) {
        try { return MAPPER.writeValueAsString(value); }
        catch (Exception e) { throw new IllegalStateException("Cannot encode JSON", e); }
    }
    @SuppressWarnings("unchecked")
    static Map<String, Object> map(Object value) {
        return value instanceof Map<?, ?> ? (Map<String, Object>) value : new LinkedHashMap<>();
    }
    @SuppressWarnings("unchecked")
    static List<Object> list(Object value) { return value instanceof List<?> ? (List<Object>) value : List.of(); }
    static String str(Object value) { return value == null ? "" : String.valueOf(value).trim(); }
    static String str(Map<String, Object> value, String key) { return str(value.get(key)); }
    static int number(Object value, int fallback) {
        try { return (int) Double.parseDouble(str(value)); } catch (Exception e) { return fallback; }
    }
    static boolean bool(Object value) { return Boolean.TRUE.equals(value) || "true".equals(str(value)); }
    static String first(Map<String, Object> source, String... keys) {
        for (String key : keys) { String value = str(source, key); if (!value.isEmpty()) return value; }
        return "";
    }
    static Map<String, Object> of(Object... pairs) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) result.put((String) pairs[i], pairs[i + 1]);
        return result;
    }
}

final class ApiException extends RuntimeException {
    final int status;
    ApiException(int status, String message) { super(message); this.status = status; }
}
