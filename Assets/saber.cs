using UnityEngine;
using UnityEngine.XR.Interaction.Toolkit;

public class saber : MonoBehaviour
{
    public Slicer slicer;
    public LayerMask layer;
    public ActionBasedController xr;
    private Vector3 _previousPos;


    private void OnTriggerEnter(Collider other)
    {
        if ((layer.value & (1 << other.transform.gameObject.layer)) > 0)
        {
            Debug.Log("hit: " + other.transform.gameObject.layer + " - actual layer:" + layer.value);
            slicer.isTouched = true;
            FindObjectOfType<Scoreboard>().IncreaseHits();
            Destroy(other.GetComponent<BoxCollider>());
        }
        else
        {
            Debug.Log("GFY");
        }

        _previousPos = transform.position;
    }

    private void OnTriggerStay(Collider other)
    {
        xr.SendHapticImpulse(1.0f, .1f);
    }
}
