rootProject.name = "atlas-workspace-lab"
include("workspace-api", "asset-service", "processing-worker")
project(":workspace-api").projectDir = file("services/workspace-api")
project(":asset-service").projectDir = file("services/asset-service")
project(":processing-worker").projectDir = file("workers/processing-worker")
include("demo-support")
project(":demo-support").projectDir = file("libraries/demo-support")
