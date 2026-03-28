#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <Wire.h>

// --- WIFI & API CONFIGURATION ---
const char *ssid = "YOUR_WIFI_SSID";         // <-- CHANGE THIS
const char *password = "YOUR_WIFI_PASSWORD"; // <-- CHANGE THIS
const String API_BASE_URL = "https://parking-system-1-w3d5.onrender.com/api";

// --- PINS CONFIGURATION (YOUR CUSTOM PINS) ---
// IR Sensors
#define S1 23
#define S2 19
#define S3 18

// OLED
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// --- STATE MANAGEMENT ---
// Hardware States
int last_s1 = -1;
int last_s2 = -1;
int last_s3 = -1;

// Virtual Server States (for OLED)
String v_s1 = "Loading";
String v_s2 = "Loading";
String v_s3 = "Loading";
int v_freeSlots = 0;

// Polling interval for downloading from database
unsigned long lastFetchTime = 0;
const unsigned long FETCH_INTERVAL_MS =
    2000; // Download website status every 2 seconds

void setup() {
  Serial.begin(115200);

  pinMode(S1, INPUT_PULLUP);
  pinMode(S2, INPUT_PULLUP);
  pinMode(S3, INPUT_PULLUP);

  Wire.begin(21, 22);

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED not found");
    while (true)
      ;
  }

  display.setRotation(2);

  // --- CONNECT TO WIFI ---
  display.clearDisplay();
  display.setTextColor(WHITE);
  display.setTextSize(1);
  display.setCursor(0, 10);
  display.println("Connecting WiFi...");
  display.display();

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi Connected! IP Address: ");
  Serial.println(WiFi.localIP());

  // Download initial database state immediately
  fetchServerStatus();
}

void loop() {
  // Reconnect if network drops
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.begin(ssid, password);
  }

  // --- 1. HARDWARE POST: Upload Sensor Data Instantly ---
  int s1 = digitalRead(S1);
  int s2 = digitalRead(S2);
  int s3 = digitalRead(S3);

  // Send update only if moving from Free->Busy or Busy->Free
  if (s1 != last_s1) {
    sendPresenceUpdate(1, (s1 == LOW));
    last_s1 = s1;
    fetchServerStatus(); // Refresh OLED immediately after upload
  }
  if (s2 != last_s2) {
    sendPresenceUpdate(2, (s2 == LOW));
    last_s2 = s2;
    fetchServerStatus();
  }
  if (s3 != last_s3) {
    sendPresenceUpdate(3, (s3 == LOW));
    last_s3 = s3;
    fetchServerStatus();
  }

  // --- 2. VIRTUAL GET: Download Website States Periodically ---
  if (millis() - lastFetchTime >= FETCH_INTERVAL_MS) {
    fetchServerStatus();
    lastFetchTime = millis();
  }

  // --- 3. OLED DISPLAY (YOUR EXACT DESIGN, BUT CLOUD SYNCED!) ---
  display.clearDisplay();
  display.setTextColor(WHITE);

  // Title
  display.setTextSize(1);
  display.setCursor(20, 0);
  display.println("SMART PARKING");

  // Slot status from LIVE website
  display.setCursor(0, 15);
  display.print("S1: ");
  display.println(v_s1);

  display.setCursor(0, 25);
  display.print("S2: ");
  display.println(v_s2);

  display.setCursor(0, 35);
  display.print("S3: ");
  display.println(v_s3);

  // Free slots display from LIVE website
  display.setTextSize(2);
  display.setCursor(0, 48);

  if (v_freeSlots > 0) {
    display.print("Free:");
    display.print(v_freeSlots);
  } else {
    display.setTextSize(1);
    display.setCursor(0, 52);
    display.println("FULL KEY");
  }

  display.display();

  delay(200); // Small loop delay
}

// --- HELPER FUNC 1: PUSH SENSOR ACTIVITY TO WEBSITE ---
void sendPresenceUpdate(int slotId, bool isPresent) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = API_BASE_URL + "/esp32/update";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<200> doc;
    doc["slotId"] = slotId;
    doc["presence"] = isPresent;

    String requestBody;
    serializeJson(doc, requestBody);

    int code = http.POST(requestBody);
    Serial.println("Pushed physical update to Slot " + String(slotId) +
                   " -> Output Code: " + String(code));

    http.end();
  }
}

// --- HELPER FUNC 2: DOWNLOAD VIRTUAL ASSIGNMENTS FOR OLED ---
void fetchServerStatus() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = API_BASE_URL + "/slots";
    http.begin(url);

    int httpResponseCode = http.GET();
    if (httpResponseCode == 200) {
      String payload = http.getString();

      StaticJsonDocument<1024> doc;
      DeserializationError error = deserializeJson(doc, payload);

      if (!error) {
        int tempFreeCount = 0;

        // Loop through the 3 slots from the Render server
        for (JsonObject slot : doc.as<JsonArray>()) {
          int id = slot["id"];
          String status = slot["status"].as<String>();

          // Translate JSON status to OLED words
          String displayWord = "Unknown";
          if (status == "available") {
            displayWord = "Free";
            tempFreeCount++;
          } else if (status == "booked") {
            displayWord = "Booked";
          } else if (status == "occupied") {
            displayWord = "Occupied";
          }

          if (id == 1)
            v_s1 = displayWord;
          if (id == 2)
            v_s2 = displayWord;
          if (id == 3)
            v_s3 = displayWord;
        }

        // Update the big counter at the bottom
        v_freeSlots = tempFreeCount;
      }
    } else {
      Serial.println("Error downloading from server: " +
                     String(httpResponseCode));
    }
    http.end();
  }
}
