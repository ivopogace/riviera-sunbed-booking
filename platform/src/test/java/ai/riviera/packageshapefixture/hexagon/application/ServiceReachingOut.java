package ai.riviera.packageshapefixture.hexagon.application;

import ai.riviera.packageshapefixture.hexagon.adapter.out.DrivenAdapter;

public class ServiceReachingOut {

	public void run(DrivenAdapter adapter) {
		adapter.write();
	}
}
