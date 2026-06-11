package io.gempba.dashboard.protocol;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;

/**
 * Single source of truth for the Jackson configuration that maps the gempba
 * wire JSON onto the records in this package. Snake-case mapping happens at
 * the mapper level so the records stay idiomatic camelCase Java.
 * <p>
 * Unknown properties are ignored so a forward-compatible C++ side can add
 * fields without breaking older dashboards.
 */
public final class JsonMapper {

    private JsonMapper() {
    }

    public static ObjectMapper create() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
        mapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        return mapper;
    }
}
