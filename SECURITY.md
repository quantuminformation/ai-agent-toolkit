# Security & Safety Guide

This document addresses common security concerns when using the AI Agent Toolkit and explains the safety measures built into the containerized environment.

## 🔒 Security Overview

The AI Agent Toolkit runs in a Docker container with multiple layers of security isolation to protect your system while allowing AI agents to work effectively on your projects.

## 🛡️ Container Security Model

### Isolation Boundaries

**✅ What the container CAN access:**
- Only files within your project directory that are explicitly mounted
- Network access for AI model API calls and authentication
- Standard container runtime resources

**❌ What the container CANNOT access:**
- Your home directory or other user files
- System files (`/etc`, `/var`, `/usr/local`, etc.)
- Other Docker containers or the Docker daemon
- Hardware devices or system services
- Files outside the mounted project directory

### Technical Security Measures

```yaml
Container Configuration:
  Privileged Mode: false          # No elevated system access
  User Namespace: isolated        # Separate user context
  Process Namespace: isolated     # Cannot see host processes
  Root Filesystem: container-only # No host filesystem access
  Capabilities: minimal          # No additional Linux capabilities
  AppArmor/SELinux: enforced     # OS-level security policies
```

## 🌐 Network Security

### Port Binding
The container exposes ports 1455-1465 for AI service authentication callbacks:
- **Local binding only**: Ports bind to your machine, not the internet
- **Firewall protected**: Your system firewall blocks external access
- **Temporary usage**: Ports are only used during authentication flows

### Internet Access
The container requires internet access for:
- AI model API calls (OpenAI, Anthropic, etc.)
- Authentication callbacks
- Package downloads and updates
- Documentation lookup

This is **restricted to the container** and cannot affect your host system's network configuration.

## 📁 File System Protection

### Mount Strategy
Only specific directories are mounted into the container:

```
Host Path                           → Container Path
/your-project/config               → /opt/agent/config
/your-project/workspaces           → /workspaces  
/your-project/scripts              → /opt/agent/scripts
/your-project/.codex               → /root/.config/codex
/your-project/.openai              → /root/.config/openai
```

### What This Means
- **Project isolation**: Only your current project is accessible
- **No system access**: Cannot read system configuration or other users' files  
- **No Docker socket**: Cannot control other containers or Docker itself
- **Version control safe**: All changes are within your Git repository

## 🤖 AI Agent Capabilities

### File Operations
AI agents can:
- Read and modify files within mounted directories
- Create new files in the project structure
- Execute scripts within the container environment

### Safeguards
- **Version control**: Use Git to track and revert changes
- **Approval mode**: Optional requirement for user confirmation on file changes
- **Scoped access**: Limited to project files only
- **Container isolation**: No access to system or personal files

## 🚨 Common Security Concerns Addressed

### "Can the AI escape the container?"
**No.** The container uses standard Docker isolation:
- Non-privileged execution prevents kernel access
- No special capabilities or host namespace access
- Standard Linux security modules (AppArmor/SELinux) enforced
- No Docker socket or system service access

### "Can it access my personal files?"
**No.** Only your project directory is mounted:
- Cannot access `/Users/[username]` beyond the project
- Cannot read browser history, documents, or other projects
- Cannot access system configuration files
- Cannot see environment variables from your host shell

### "Can it make network requests on my behalf?"
**Limited.** Network access is containerized:
- Cannot modify your system's network configuration
- Cannot access localhost services on your host (different network namespace)
- Can only make outbound requests for AI services and authentication
- Cannot intercept or modify your network traffic

### "What if the AI model is compromised?"
**Impact is limited:**
- Damage confined to your project directory only
- Cannot install system-level malware
- Cannot access credentials stored outside the project
- Cannot persist beyond container lifecycle

## 🔧 Security Best Practices

### Recommended Workflow
1. **Use version control**: Commit work before running AI agents
2. **Review changes**: Check AI modifications before committing
3. **Separate projects**: Use different project directories for different work
4. **Regular backups**: Standard backup practices apply
5. **Monitor activity**: Review container logs if concerned

### Optional Security Enhancements
- **Approval mode**: Require confirmation for file changes
- **Read-only mounts**: Mount configuration directories as read-only
- **Network restrictions**: Limit allowed sites (though this may break functionality)
- **Resource limits**: Set CPU and memory constraints

## 🐛 Reporting Security Issues

If you discover a security vulnerability:

1. **Do not** create a public GitHub issue
2. Email security concerns to: [Your Security Email]
3. Include detailed reproduction steps
4. Allow time for assessment and patch development

## 📚 Additional Resources

- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [Container Security Guide](https://kubernetes.io/docs/concepts/security/)
- [OWASP Container Security](https://owasp.org/www-project-container-security/)

---

## 🎯 Summary

The AI Agent Toolkit is designed with security as a core principle:
- **Strong isolation** prevents system access
- **Scoped file access** protects your personal data  
- **Network containment** limits potential impact
- **Standard practices** follow Docker security best practices

The container provides a safe environment for AI development while maintaining the isolation necessary to protect your system and personal files.

---

*Last updated: September 2025*