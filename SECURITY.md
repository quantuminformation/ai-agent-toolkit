# Security Guide

Docker container isolation protects your system while allowing AI agents to work on your project.

## Container Access

**✅ Can access:** Project files (mounted directories), internet for AI APIs  
**❌ Cannot access:** System files, other user directories, Docker daemon, hardware

## File System

Only these directories are mounted:
- `config/` → `/opt/agent/config`
- `workspaces/` → `/workspaces`  
- `scripts/` → `/opt/agent/scripts`
- `.codex/`, `.openai/` → configuration

## Network

- **Ports 1455-1465:** Authentication callbacks (localhost only)
- **Internet access:** AI APIs, authentication, downloads
- **Cannot:** Modify host network configuration

## FAQ

**Q: Can AI escape the container?**  
A: No. Non-privileged, isolated namespaces, no Docker socket.

**Q: Can it access my personal files?**  
A: No. Only project directory mounted.

**Q: What if AI model is compromised?**  
A: Damage limited to project files only.

## Best Practices

- Commit work before running agents
- Review AI changes before pushing  
- Enable approval mode for extra safety
- Monitor container logs if concerned

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