!macro customInit
  ; Terminate any running instances of the app before installing
  nsExec::Exec 'taskkill /F /IM "FS25 MT Mod Manager.exe" /T'
  Sleep 1000
!macroend
