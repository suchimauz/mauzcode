/**
 * Classify core namespaces and declare the explicit Standard function patterns.
 *
 * Use this catalogue when reviewing new core namespaces or changing Standard access. Standard entries grant only their listed patterns; creator entries are administration or opt-in capabilities, while internal entries are implementation plumbing. Classification is documentation, not an additional restriction on Creator.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Record<string, { classification: "standard" | "creator" | "internal"; patterns: string[] }> {
    return {
        "a": {
            "classification": "internal",
            "patterns": []
        },
        "agent": {
            "classification": "standard",
            "patterns": [
                "agent.respondHtml",
                "agent.readResult",
                "agent.compact",
                "agent.delegate",
                "agent.team",
                "agent.ask",
                "agent.steer",
                "agent.finishTask",
                "agent.archiveMember",
                "agent.archiveCompleted",
                "agent.unarchiveMember",
                "agent.search",
                "agent.message",
                "agent.current",
                "agent.wake",
                "agent.cron",
                "agent.watch",
                "agent.triggers",
                "agent.cancelTrigger",
                "agent.cancelAllTriggers"
            ]
        },
        "agentPreset": {
            "classification": "standard",
            "patterns": [
                "agentPreset.list",
                "agentPreset.get"
            ]
        },
        "api": {
            "classification": "internal",
            "patterns": []
        },
        "attachments": {
            "classification": "standard",
            "patterns": [
                "attachments.*"
            ]
        },
        "auth": {
            "classification": "internal",
            "patterns": []
        },
        "autotext": {
            "classification": "internal",
            "patterns": []
        },
        "canvas": {
            "classification": "standard",
            "patterns": [
                "canvas.*"
            ]
        },
        "chat": {
            "classification": "internal",
            "patterns": []
        },
        "code": {
            "classification": "standard",
            "patterns": [
                "code.callers",
                "code.slice",
                "code.quality",
                "code.coverage",
                "code.dead",
                "code.boundary"
            ]
        },
        "codexAccount": {
            "classification": "creator",
            "patterns": []
        },
        "codexSocksIsolated": {
            "classification": "creator",
            "patterns": []
        },
        "codexTunnel": {
            "classification": "creator",
            "patterns": []
        },
        "commands": {
            "classification": "internal",
            "patterns": []
        },
        "compaction": {
            "classification": "internal",
            "patterns": []
        },
        "controlPlane": {
            "classification": "creator",
            "patterns": []
        },
        "cron": {
            "classification": "creator",
            "patterns": []
        },
        "decision": {
            "classification": "internal",
            "patterns": []
        },
        "dev": {
            "classification": "creator",
            "patterns": []
        },
        "dock": {
            "classification": "internal",
            "patterns": []
        },
        "embeddings": {
            "classification": "internal",
            "patterns": []
        },
        "events": {
            "classification": "internal",
            "patterns": []
        },
        "external": {
            "classification": "creator",
            "patterns": []
        },
        "files": {
            "classification": "standard",
            "patterns": [
                "files.*"
            ]
        },
        "frontendBridge": {
            "classification": "internal",
            "patterns": []
        },
        "frontendRuntime": {
            "classification": "internal",
            "patterns": []
        },
        "git": {
            "classification": "standard",
            "patterns": [
                "git.*"
            ]
        },
        "goal": {
            "classification": "standard",
            "patterns": [
                "goal.tool*"
            ]
        },
        "h2": {
            "classification": "internal",
            "patterns": []
        },
        "http": {
            "classification": "internal",
            "patterns": []
        },
        "input": {
            "classification": "standard",
            "patterns": [
                "input.*"
            ]
        },
        "jev": {
            "classification": "creator",
            "patterns": []
        },
        "legacyUi": {
            "classification": "internal",
            "patterns": []
        },
        "markdown": {
            "classification": "standard",
            "patterns": [
                "markdown.*"
            ]
        },
        "mentions": {
            "classification": "internal",
            "patterns": []
        },
        "models": {
            "classification": "creator",
            "patterns": []
        },
        "nav": {
            "classification": "internal",
            "patterns": []
        },
        "planning": {
            "classification": "standard",
            "patterns": [
                "planning.*"
            ]
        },
        "plugins": {
            "classification": "standard",
            "patterns": [
                "plugins.search",
                "plugins.read",
                "plugins.functions"
            ]
        },
        "procs": {
            "classification": "internal",
            "patterns": []
        },
        "projects": {
            "classification": "standard",
            "patterns": [
                "projects.list",
                "projects.get"
            ]
        },
        "remote": {
            "classification": "standard",
            "patterns": [
                "remote.servers",
                "remote.status"
            ]
        },
        "repl": {
            "classification": "creator",
            "patterns": []
        },
        "resources": {
            "classification": "creator",
            "patterns": []
        },
        "resultStore": {
            "classification": "standard",
            "patterns": [
                "resultStore.*"
            ]
        },
        "runtime": {
            "classification": "standard",
            "patterns": [
                "runtime.docs.search",
                "runtime.docs.get"
            ]
        },
        "screen": {
            "classification": "creator",
            "patterns": []
        },
        "secrets": {
            "classification": "standard",
            "patterns": [
                "secrets.list"
            ]
        },
        "secureInput": {
            "classification": "creator",
            "patterns": []
        },
        "serverMetrics": {
            "classification": "internal",
            "patterns": []
        },
        "session": {
            "classification": "standard",
            "patterns": [
                "session.plan",
                "session.done",
                "session.updatePlan",
                "session.removePlan",
                "session.get*",
                "session.search*"
            ]
        },
        "settings": {
            "classification": "standard",
            "patterns": [
                "settings.get",
                "settings.getString",
                "settings.getNumber",
                "settings.list"
            ]
        },
        "sharedAgent": {
            "classification": "standard",
            "patterns": [
                "sharedAgent.list",
                "sharedAgent.delegate",
                "sharedAgent.result"
            ]
        },
        "sidebar": {
            "classification": "internal",
            "patterns": []
        },
        "skill": {
            "classification": "creator",
            "patterns": []
        },
        "socksProxy": {
            "classification": "creator",
            "patterns": []
        },
        "sshAccount": {
            "classification": "creator",
            "patterns": []
        },
        "sshInstance": {
            "classification": "creator",
            "patterns": []
        },
        "sshProvider": {
            "classification": "creator",
            "patterns": []
        },
        "tools": {
            "classification": "standard",
            "patterns": [
                "tools.read",
                "tools.write",
                "tools.edit",
                "tools.grep",
                "tools.find",
                "tools.bash",
                "tools.eval",
                "tools.toolSearch",
                "tools.toolDescribe",
                "tools.readResult",
                "tools.requestInput",
                "tools.planUpdate",
                "tools.planDone",
                "tools.delegateTask",
                "tools.finishTask",
                "tools.showArtifact"
            ]
        },
        "tsgo": {
            "classification": "creator",
            "patterns": []
        },
        "ui": {
            "classification": "creator",
            "patterns": []
        },
        "update": {
            "classification": "creator",
            "patterns": []
        },
        "webPush": {
            "classification": "creator",
            "patterns": []
        },
        "workspace": {
            "classification": "standard",
            "patterns": [
                "workspace.*"
            ]
        }
    };
}
