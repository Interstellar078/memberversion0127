-- Migration: Add resource_restaurants table
-- Created: 2026-02-03

CREATE TABLE IF NOT EXISTS resource_restaurants (
    id VARCHAR(50) PRIMARY KEY,
    city_id VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    cuisine_type VARCHAR(100),
    avg_price INTEGER NOT NULL DEFAULT 0 CHECK (avg_price >= 0),
    dietary_tags VARCHAR(200),
    meal_type VARCHAR(50),
    owner_id VARCHAR(120) NOT NULL,
    is_public BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_restaurants_city_id ON resource_restaurants(city_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_owner_id ON resource_restaurants(owner_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_is_public ON resource_restaurants(is_public);
CREATE INDEX IF NOT EXISTS idx_restaurants_cuisine_type ON resource_restaurants(cuisine_type);
CREATE INDEX IF NOT EXISTS idx_restaurants_city_public ON resource_restaurants(city_id, is_public);
CREATE INDEX IF NOT EXISTS idx_restaurants_city_name ON resource_restaurants(city_id, lower(name));

COMMENT ON TABLE resource_restaurants IS 'Restaurant resources for itinerary generation';
COMMENT ON COLUMN resource_restaurants.cuisine_type IS 'Cuisine type: 中餐, 日料, 西餐, etc';
COMMENT ON COLUMN resource_restaurants.avg_price IS 'Average price per person';
COMMENT ON COLUMN resource_restaurants.dietary_tags IS 'Dietary restrictions: 素食, 清真, 无麸质, etc';
COMMENT ON COLUMN resource_restaurants.meal_type IS 'Meal type: 早餐, 午餐, 晚餐, 全天';
COMMENT ON COLUMN resource_restaurants.created_at IS 'Row creation time';
