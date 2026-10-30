{{- define "atlas-platform.guard" -}}
{{- if ne .Release.Namespace (printf "atlas-%s" .Values.environment) -}}{{ fail "Namespace does not match demo environment" }}{{- end -}}
{{- if ne .Release.Name "atlas-platform" -}}{{ fail "Unexpected release ownership" }}{{- end -}}
{{- end -}}
