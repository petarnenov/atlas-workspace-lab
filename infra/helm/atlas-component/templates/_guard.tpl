{{- define "atlas-component.guard" -}}
{{- if ne .Release.Namespace (printf "atlas-%s" .Values.environment) -}}{{ fail "Namespace does not match demo environment" }}{{- end -}}
{{- if ne .Release.Name (printf "atlas-%s" .Values.component) -}}{{ fail "Unexpected release ownership" }}{{- end -}}
{{- end -}}
