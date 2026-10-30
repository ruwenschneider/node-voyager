//! Real OPC UA client session (async-opcua).
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::{DateTime, Utc};
use opcua::client::{ClientBuilder, DataChangeCallback, IdentityToken, Session};
use opcua::types::{
    AttributeId, BrowseDescription, BrowseDirection, BrowseResultMask, DataValue, MessageSecurityMode,
    MonitoredItemCreateRequest, MonitoringMode, MonitoringParameters, NodeClassMask, NodeId, ReadValueId,
    ReferenceTypeId, TimestampsToReturn, UserTokenPolicy, Variant,
};
use serde_json::{json, Value};
use tauri::async_runtime::JoinHandle;

use super::{explorer, NodeItem, TelemetryRecord, TelemetryTx, CLIENT_ID};

struct Sub {
    subscription_id: u32,
}

pub struct OpcClient {
    session: Arc<Session>,
    event_loop: Mutex<Option<JoinHandle<()>>>,
    endpoint: String,
    subs: tokio::sync::Mutex<HashMap<String, Sub>>,
}

fn security_mode(mode: &str) -> (&'static str, MessageSecurityMode) {
    match mode {
        "Sign" => ("Basic256Sha256", MessageSecurityMode::Sign),
        "SignAndEncrypt" => ("Basic256Sha256", MessageSecurityMode::SignAndEncrypt),
        _ => ("None", MessageSecurityMode::None),
    }
}

fn variant_to_json(v: &Variant) -> (Value, String) {
    match v {
        Variant::Boolean(b) => (json!(b), "Boolean".into()),
        Variant::SByte(x) => (json!(x), "SByte".into()),
        Variant::Byte(x) => (json!(x), "Byte".into()),
        Variant::Int16(x) => (json!(x), "Int16".into()),
        Variant::UInt16(x) => (json!(x), "UInt16".into()),
        Variant::Int32(x) => (json!(x), "Int32".into()),
        Variant::UInt32(x) => (json!(x), "UInt32".into()),
        Variant::Int64(x) => (json!(x), "Int64".into()),
        Variant::UInt64(x) => (json!(x), "UInt64".into()),
        Variant::Float(x) => (json!(x), "Float".into()),
        Variant::Double(x) => (json!(x), "Double".into()),
        Variant::String(s) => (json!(s.as_ref()), "String".into()),
        other => (json!(other.to_string()), "Variant".into()),
    }
}

fn to_utc(dt: &opcua::types::DateTime) -> Option<DateTime<Utc>> {
    Some(dt.as_chrono())
}

impl OpcClient {
    pub async fn connect(endpoint: &str, mode: &str) -> Result<Self, String> {
        let (policy, msg_mode) = security_mode(mode);
        let mut client = ClientBuilder::new()
            .application_name("Node Voyager")
            .application_uri("urn:NodeVoyager")
            .product_uri("urn:NodeVoyager")
            .create_sample_keypair(true)
            .trust_server_certs(true)
            .session_retry_limit(3)
            .client()
            .map_err(|e| format!("Client configuration invalid: {}", e.join(", ")))?;

        let ep = (endpoint, policy, msg_mode, UserTokenPolicy::anonymous());
        let (session, event_loop) = client
            .connect_to_matching_endpoint(ep, IdentityToken::Anonymous)
            .await
            .map_err(|e| format!("Connection failed: {e}"))?;
        let handle = tauri::async_runtime::spawn(async move {
            let _ = event_loop.run().await;
        });

        let connected = tokio::time::timeout(Duration::from_secs(10), session.wait_for_connection()).await;
        if !matches!(connected, Ok(true)) {
            handle.abort();
            return Err("Connection timed out after 10 s".into());
        }
        Ok(Self {
            session,
            event_loop: Mutex::new(Some(handle)),
            endpoint: endpoint.to_string(),
            subs: tokio::sync::Mutex::new(HashMap::new()),
        })
    }

    pub fn server_name(&self) -> String {
        self.endpoint.clone()
    }

    pub async fn browse(&self, node_id: &str) -> Result<Vec<NodeItem>, String> {
        let id = NodeId::from_str(node_id).map_err(|_| format!("BadNodeIdInvalid: {node_id}"))?;
        let desc = BrowseDescription {
            node_id: id,
            browse_direction: BrowseDirection::Forward,
            reference_type_id: ReferenceTypeId::HierarchicalReferences.into(),
            include_subtypes: true,
            node_class_mask: (NodeClassMask::OBJECT | NodeClassMask::VARIABLE | NodeClassMask::METHOD).bits(),
            result_mask: BrowseResultMask::All as u32,
        };
        let results = self
            .session
            .browse(&[desc], 0, None)
            .await
            .map_err(|e| format!("Browse failed: {e}"))?;
        let mut items: Vec<NodeItem> = results
            .into_iter()
            .flat_map(|r| r.references.unwrap_or_default())
            .map(|r| {
                let class = explorer::class_label(&format!("{:?}", r.node_class));
                NodeItem {
                    node_id: r.node_id.node_id.to_string(),
                    browse_name: r.browse_name.name.to_string(),
                    display_name: r.display_name.text.to_string(),
                    has_children: class != "Variable" && class != "Method",
                    node_class: class,
                    data_type: None,
                    unit: None,
                }
            })
            .collect();
        explorer::sort_items(&mut items);
        Ok(items)
    }

    pub async fn subscribe(
        &self,
        node_id: &str,
        alias: &str,
        interval_ms: u32,
        tx: TelemetryTx,
    ) -> Result<bool, String> {
        let mut subs = self.subs.lock().await;
        if subs.contains_key(node_id) {
            return Ok(false);
        }
        let id = NodeId::from_str(node_id).map_err(|_| format!("BadNodeIdInvalid: {node_id}"))?;
        let interval = interval_ms.max(20) as f64;
        let (node, alias_s) = (node_id.to_string(), alias.to_string());

        let callback = DataChangeCallback::new(move |dv: DataValue, _item| {
            let Some(variant) = dv.value.as_ref() else { return };
            let (value, data_type) = variant_to_json(variant);
            let status = dv.status.map(|s| s.to_string()).unwrap_or_else(|| "Good".into());
            let _ = tx.send(TelemetryRecord {
                timestamp: Utc::now(),
                source_timestamp: dv.source_timestamp.as_ref().and_then(to_utc),
                node_id: node.clone(),
                alias: alias_s.clone(),
                value,
                data_type,
                status_code: status,
                client_id: CLIENT_ID.into(),
                unit: None,
            });
        });

        let subscription_id = self
            .session
            .create_subscription(Duration::from_millis(interval as u64), 30, 10, 0, 0, true, callback)
            .await
            .map_err(|e| format!("Create subscription failed: {e}"))?;

        let request = MonitoredItemCreateRequest {
            item_to_monitor: ReadValueId {
                node_id: id,
                attribute_id: AttributeId::Value as u32,
                ..Default::default()
            },
            monitoring_mode: MonitoringMode::Reporting,
            requested_parameters: MonitoringParameters {
                client_handle: 0,
                sampling_interval: interval,
                queue_size: 10,
                discard_oldest: true,
                ..Default::default()
            },
        };
        let created = self
            .session
            .create_monitored_items(subscription_id, TimestampsToReturn::Both, vec![request])
            .await
            .map_err(|e| format!("Create monitored item failed: {e}"))?;
        if let Some(item) = created.first() {
            if item.result.status_code.is_bad() {
                let _ = self.session.delete_subscription(subscription_id).await;
                return Err(format!("Monitored item rejected: {}", item.result.status_code));
            }
        }
        subs.insert(node_id.to_string(), Sub { subscription_id });
        Ok(true)
    }

    pub async fn unsubscribe(&self, node_id: &str) -> Result<bool, String> {
        let sub = self.subs.lock().await.remove(node_id);
        match sub {
            Some(s) => {
                self.session
                    .delete_subscription(s.subscription_id)
                    .await
                    .map_err(|e| format!("Delete subscription failed: {e}"))?;
                Ok(true)
            }
            None => Ok(false),
        }
    }

    pub async fn disconnect(&self) {
        let _ = self.session.disconnect().await;
        let handle = self.event_loop.lock().ok().and_then(|mut h| h.take());
        if let Some(h) = handle {
            h.abort();
        }
    }
}
