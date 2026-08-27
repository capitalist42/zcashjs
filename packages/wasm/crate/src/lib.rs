use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn backend_version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

#[wasm_bindgen]
pub fn unjumble_unified_payload(payload: &[u8]) -> Result<Vec<u8>, JsError> {
    f4jumble::f4jumble_inv(payload)
        .map_err(|_| JsError::new("payload length is outside the ZIP 316 F4Jumble bounds"))
}

#[cfg(test)]
mod tests {
    #[test]
    fn f4jumble_round_trip() {
        let message = vec![42; 48];
        let jumbled = f4jumble::f4jumble(&message).unwrap();
        assert_eq!(super::unjumble_unified_payload(&jumbled).unwrap(), message);
    }
}
