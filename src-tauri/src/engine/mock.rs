//! Industrial simulator: synthetic address space and signal generators.
use std::collections::HashMap;
use std::f64::consts::PI;
use std::sync::Mutex;
use std::time::Duration;

use chrono::Utc;
use serde_json::{json, Value};
use tauri::async_runtime::JoinHandle;

use super::{explorer, NodeItem, TelemetryRecord, TelemetryTx, CLIENT_ID, ROOT_NODE};

#[derive(Clone, Copy)]
enum Signal {
    /// Sine wave with jitter, `lo..hi`.
    Rpm,
    /// Gaussian noise around a slow drift, `lo..hi`.
    Vibration,
    Temperature,
    Pressure,
    Voltage,
    State,
}

struct Tag {
    id: &'static str,
    name: &'static str,
    parent: &'static str,
    signal: Signal,
    unit: &'static str,
}

struct Folder {
    id: &'static str,
    name: &'static str,
    parent: &'static str,
}

const FOLDERS: &[Folder] = &[
    Folder { id: "ns=2;s=Plant", name: "Plant", parent: ROOT_NODE },
    Folder { id: "ns=2;s=Turbine", name: "Turbine", parent: "ns=2;s=Plant" },
    Folder { id: "ns=2;s=PowerSupply", name: "PowerSupply", parent: "ns=2;s=Plant" },
    Folder { id: "ns=2;s=Coolant", name: "Coolant", parent: "ns=2;s=Plant" },
    Folder { id: "ns=2;s=System", name: "System", parent: "ns=2;s=Plant" },
];

const TAGS: &[Tag] = &[
    Tag { id: "ns=2;s=Turbine.Speed", name: "Speed", parent: "ns=2;s=Turbine", signal: Signal::Rpm, unit: "RPM" },
    Tag { id: "ns=2;s=Turbine.Vibration", name: "Vibration", parent: "ns=2;s=Turbine", signal: Signal::Vibration, unit: "mm/s" },
    Tag { id: "ns=2;s=Turbine.Temperature", name: "Temperature", parent: "ns=2;s=Turbine", signal: Signal::Temperature, unit: "°C" },
    Tag { id: "ns=2;s=Turbine.Pressure", name: "Pressure", parent: "ns=2;s=Turbine", signal: Signal::Pressure, unit: "bar" },
    Tag { id: "ns=2;s=PowerSupply.Voltage", name: "Voltage", parent: "ns=2;s=PowerSupply", signal: Signal::Voltage, unit: "V" },
    Tag { id: "ns=2;s=Coolant.Temperature", name: "Temperature", parent: "ns=2;s=Coolant", signal: Signal::Temperature, unit: "°C" },
    Tag { id: "ns=2;s=Coolant.Pressure", name: "Pressure", parent: "ns=2;s=Coolant", signal: Signal::Pressure, unit: "bar" },
    Tag { id: "ns=2;s=System.State", name: "State", parent: "ns=2;s=System", signal: Signal::State, unit: "" },
];

/// Small xorshift PRNG: no extra dependency, deterministic per seed.
struct Rng(u64);

impl Rng {
    fn new(seed: u64) -> Self {
        Rng(seed | 1)
    }
    fn next_f64(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 >> 11) as f64 / (1u64 << 53) as f64
    }
    /// Standard normal via Box-Muller.
    fn gauss(&mut self) -> f64 {
        let u1 = self.next_f64().max(1e-12);
        let u2 = self.next_f64();
        (-2.0 * u1.ln()).sqrt() * (2.0 * PI * u2).cos()
    }
}

fn sample(signal: Signal, t: f64, rng: &mut Rng) -> Value {
    match signal {
        Signal::Rpm => {
            let v = 3300.0 + 250.0 * (2.0 * PI * t / 20.0).sin() + rng.gauss() * 12.0;
            json!(round(v.clamp(3000.0, 3600.0), 1))
        }
        Signal::Vibration => {
            let drift = 2.3 + 0.9 * (2.0 * PI * t / 45.0).sin();
            json!(round((drift + rng.gauss() * 0.45).clamp(0.5, 4.2), 3))
        }
        Signal::Temperature => {
            let v = 78.0 + 6.0 * (2.0 * PI * t / 60.0).sin() + rng.gauss() * 0.3;
            json!(round(v, 2))
        }
        Signal::Pressure => {
            let v = 8.2 + 0.7 * (2.0 * PI * t / 30.0).cos() + rng.gauss() * 0.05;
            json!(round(v, 3))
        }
        Signal::Voltage => json!(round(400.0 + 4.0 * (2.0 * PI * t / 10.0).sin() + rng.gauss() * 0.6, 2)),
        Signal::State => {
            // Mostly "Running", brief "Warning" window every 90 s.
            json!(if (t % 90.0) > 82.0 { "Warning" } else { "Running" })
        }
    }
}

fn round(v: f64, digits: i32) -> f64 {
    let f = 10f64.powi(digits);
    (v * f).round() / f
}

fn item_from_folder(f: &Folder) -> NodeItem {
    NodeItem {
        node_id: f.id.into(),
        browse_name: f.name.into(),
        display_name: f.name.into(),
        node_class: "Object".into(),
        has_children: true,
        data_type: None,
        unit: None,
    }
}

fn item_from_tag(t: &Tag) -> NodeItem {
    NodeItem {
        node_id: t.id.into(),
        browse_name: t.name.into(),
        display_name: t.name.into(),
        node_class: "Variable".into(),
        has_children: false,
        data_type: Some(if matches!(t.signal, Signal::State) { "String" } else { "Double" }.into()),
        unit: (!t.unit.is_empty()).then(|| t.unit.to_string()),
    }
}

pub struct MockEngine {
    tasks: Mutex<HashMap<String, JoinHandle<()>>>,
}

impl MockEngine {
    pub fn new() -> Self {
        Self { tasks: Mutex::new(HashMap::new()) }
    }

    pub fn browse(&self, node_id: &str) -> Result<Vec<NodeItem>, String> {
        let known = node_id == ROOT_NODE || FOLDERS.iter().any(|f| f.id == node_id);
        if !known {
            return Err(format!("BadNodeIdUnknown: {node_id}"));
        }
        let mut items: Vec<NodeItem> = FOLDERS
            .iter()
            .filter(|f| f.parent == node_id)
            .map(item_from_folder)
            .chain(TAGS.iter().filter(|t| t.parent == node_id).map(item_from_tag))
            .collect();
        explorer::sort_items(&mut items);
        Ok(items)
    }

    pub fn subscribe(&self, node_id: &str, alias: &str, interval_ms: u32, tx: TelemetryTx) -> Result<bool, String> {
        let tag = TAGS.iter().find(|t| t.id == node_id).ok_or_else(|| format!("BadNodeIdUnknown: {node_id}"))?;
        let mut tasks = self.tasks.lock().map_err(|_| "Simulator state poisoned".to_string())?;
        if tasks.contains_key(node_id) {
            return Ok(false);
        }
        let interval = Duration::from_millis(interval_ms.clamp(20, 10_000) as u64);
        let alias = alias.to_string();
        let seed = node_id.bytes().fold(0x9E37_79B9_7F4A_7C15u64, |a, b| a.rotate_left(5) ^ b as u64);
        let signal = tag.signal;
        let unit = (!tag.unit.is_empty()).then(|| tag.unit.to_string());
        let data_type = if matches!(signal, Signal::State) { "String" } else { "Double" };
        let id = tag.id.to_string();

        let handle = tauri::async_runtime::spawn(async move {
            let mut rng = Rng::new(seed);
            let start = std::time::Instant::now();
            let mut tick = tokio::time::interval(interval);
            tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                tick.tick().await;
                let now = Utc::now();
                let record = TelemetryRecord {
                    timestamp: now,
                    source_timestamp: Some(now),
                    node_id: id.clone(),
                    alias: alias.clone(),
                    value: sample(signal, start.elapsed().as_secs_f64(), &mut rng),
                    data_type: data_type.into(),
                    status_code: "Good".into(),
                    client_id: CLIENT_ID.into(),
                    unit: unit.clone(),
                };
                if tx.send(record).is_err() {
                    break;
                }
            }
        });
        tasks.insert(node_id.to_string(), handle);
        Ok(true)
    }

    pub fn unsubscribe(&self, node_id: &str) -> Result<bool, String> {
        let mut tasks = self.tasks.lock().map_err(|_| "Simulator state poisoned".to_string())?;
        Ok(match tasks.remove(node_id) {
            Some(h) => {
                h.abort();
                true
            }
            None => false,
        })
    }

    pub fn shutdown(&self) {
        if let Ok(mut tasks) = self.tasks.lock() {
            for (_, h) in tasks.drain() {
                h.abort();
            }
        }
    }
}
