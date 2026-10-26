; Custom NSIS initialization script
; The default electron-builder CHECK_APP_RUNNING macro handles stopping running instances safely without killing the installer itself.
!macro customInit
  ; No-op: rely on standard NSIS single-instance handling
!macroend
