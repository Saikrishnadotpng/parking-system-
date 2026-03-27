# ESP32 Integration Guide for SmartPark

This guide explains how your ESP32 prototype can communicate with the SmartPark web server to provide real-time parking slot availability.

## The API Endpoint

Your Node.js server exposes a specific endpoint for the ESP32:

**URL:** `http://<YOUR_COMPUTER_LOCAL_IP>:3000/api/esp32/update`  
**Method:** `POST`  
**Headers:** `Content-Type: application/json`

*(Make sure both the ESP32 and the Computer running the server are on the same Wi-Fi network)*

## Payload Format

When your ESP32's ultrasonic or IR sensor detects a change in a parking slot's state (e.g., a car arrives or leaves), it should send a JSON payload like this:

```json
{
  "slotId": 1,
  "status": "occupied"
}
```

### Valid Statuses:
- `"available"`: No car is detected in the slot. The web app will immediately show it as green and available for booking across all connected browsers.
- `"occupied"`: A car is physically detected in the slot. The web app will show it as red and unavailable.

*Note: The web users can also put a slot into a `"booked"` state when they reserve it via the OTP flow. If the ESP32 detects a physical car arriving in a "booked" slot, it can send `"occupied"`.*

## Example Arduino / C++ Snippet for ESP32

Here is a basic example of how to make the HTTP POST request using the standard `HTTPClient` library on ESP32:

```cpp
#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Replace with your computer's local IP address where the Node server is running (e.g. 192.168.1.100)
const char* serverName = "http://192.168.1.100:3000/api/esp32/update";

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while(WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to WiFi");
}

void updateSlot(int slotId, String status) {
  if(WiFi.status() == WL_CONNECTED){
    HTTPClient http;
    http.begin(serverName);
    http.addHeader("Content-Type", "application/json");
    
    // Construct inline JSON payload
    String jsonPayload = "{\"slotId\": " + String(slotId) + ", \"status\": \"" + status + "\"}";
    
    int httpResponseCode = http.POST(jsonPayload);
    
    Serial.print("HTTP Response code: ");
    Serial.println(httpResponseCode);
    http.end();
  }
}

void loop() {
  // Example logic: If sensor on slot 1 detects a car
  int const SENSOR_PIN = 14; 
  bool carDetected = digitalRead(SENSOR_PIN) == HIGH;
  
  if (carDetected) {
    updateSlot(1, "occupied");
  } else {
    updateSlot(1, "available");
  }
  
  // Throttle updates appropriately (e.g., only send updates on actual state CHANGE, or every 5 secs)
  delay(5000); 
}
```

## Testing it via PowerShell

You can test the endpoint yourself right now using Windows PowerShell to simulate the ESP32:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/esp32/update" -Method Post -Headers @{"Content-Type"="application/json"} -Body '{"slotId": 2, "status": "occupied"}'
```
This will instantly mark Slot 2 as "Occupied" on your webpage.
