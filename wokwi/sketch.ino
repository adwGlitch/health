#define BLYNK_TEMPLATE_ID "TMPL3RYm45DWM"
#define BLYNK_TEMPLATE_NAME "farmGuard AI"
#define BLYNK_AUTH_TOKEN "deZoSSU9pU5aZUGqqhC_ordg66xxcVyM"

#include <WiFi.h>
#include <BlynkSimpleEsp32.h>
#include <Wire.h>
#include <DHT.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

#define DHTPIN 4
#define DHTTYPE DHT22

#define POT_PIN 34
#define GAS_PIN 35

char ssid[] = "Wokwi-GUEST";
char pass[] = "";

DHT dht(DHTPIN, DHTTYPE);
Adafruit_MPU6050 mpu;

BlynkTimer timer;

void sendSensorData() {

  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();

  int potValue = analogRead(POT_PIN);
  int heartRate = map(potValue, 0, 4095, 60, 150);

  int gasValue = analogRead(GAS_PIN);

  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  float movement =
    abs(a.acceleration.x) +
    abs(a.acceleration.y) +
    abs(a.acceleration.z);

  String status = "HEALTHY";

  if (temperature > 40 || heartRate > 130 || gasValue > 3000) {
    status = "CRITICAL";
  }
  else if (temperature > 39 || heartRate > 100 || gasValue > 1500) {
    status = "WARNING";
  }

  // Send data to Blynk
  Blynk.virtualWrite(V0, temperature);
  Blynk.virtualWrite(V1, heartRate);
  Blynk.virtualWrite(V2, gasValue);
  Blynk.virtualWrite(V3, movement);
  Blynk.virtualWrite(V4, status);

  // Serial Monitor
  Serial.println("===== FarmGuard AI =====");

  Serial.print("Temperature: ");
  Serial.print(temperature);
  Serial.println(" C");

  Serial.print("Humidity: ");
  Serial.print(humidity);
  Serial.println(" %");

  Serial.print("Heart Rate: ");
  Serial.print(heartRate);
  Serial.println(" BPM");

  Serial.print("Gas Level: ");
  Serial.println(gasValue);

  Serial.print("Movement: ");
  Serial.println(movement);

  Serial.print("Status: ");
  Serial.println(status);

  Serial.println("------------------------");
}

void setup() {

  Serial.begin(115200);

  dht.begin();

  if (!mpu.begin()) {
    Serial.println("MPU6050 not found!");
    while (1);
  }

  Blynk.begin(BLYNK_AUTH_TOKEN, ssid, pass);

  timer.setInterval(3000L, sendSensorData);

  Serial.println("FarmGuard AI System Started");
}

void loop() {
  Blynk.run();
  timer.run();
}
