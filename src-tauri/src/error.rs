use serde::Serialize;
use std::fmt;

/// Serializable error returned to the React client.
///
/// The `code` field is intentionally stable so the UI can distinguish recoverable
/// situations (for example `COPY_MODIFIED`) from generic failures.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CmdError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl CmdError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            detail: None,
        }
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    pub fn io(context: &str, error: impl fmt::Display) -> Self {
        Self::new("IO_ERROR", context.to_string()).with_detail(error.to_string())
    }
}

impl fmt::Display for CmdError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.detail {
            Some(detail) => write!(f, "{}: {} ({})", self.code, self.message, detail),
            None => write!(f, "{}: {}", self.code, self.message),
        }
    }
}

impl std::error::Error for CmdError {}

pub type CmdResult<T> = Result<T, CmdError>;
